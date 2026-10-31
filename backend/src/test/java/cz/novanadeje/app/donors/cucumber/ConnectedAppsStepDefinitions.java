package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.cucumber.TotpCodes;
import cz.novanadeje.app.support.FakeClientMetadataSource;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

public class ConnectedAppsStepDefinitions {

    private static final Map<String, String> TOKEN_ERROR_DESCRIPTIONS = Map.of(
            "invalid_grant", "The grant is invalid, expired, already used or issued to another client.",
            "invalid_client", "The client is not known or does not match.",
            "invalid_target", "Tokens are not issued for the requested resource.",
            "invalid_request", "The request lacks a parameter or carries one that is not valid.",
            "unsupported_grant_type", "grant_type is not supported");
    private static final String METADATA_PATH = "/.well-known/oauth-authorization-server";
    private static final String CLIENT_PATH = "/api/donors/oauth/client";
    private static final String AUTHORIZE_PATH = "/api/donors/oauth/authorize";
    private static final String TOKEN_PATH = "/api/donors/oauth/token";
    private static final String CONNECTIONS_PATH = "/api/donors/me/connections";
    private static final String BACKUPS_PATH = "/api/admin/operations/backups";
    private static final String REFRESH_PATH = "/api/donors/auth/refresh";
    private static final String ADMIN_PATH = "/api/admin/donors";
    private static final String ISSUER = "http://localhost:4200";
    private static final String MCP_RESOURCE = ISSUER + "/mcp";
    private static final String API_RESOURCE = ISSUER + "/api";
    private static final String TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
    private static final String ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
    private static final String VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    private static final String DEFAULT_STATE = "xyz";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final TotpCodes totpCodes;
    private final DonorPasskeyStepDefinitions passkeys;

    private String clientId;
    private String redirectUri;
    private String code;
    private String connectorAccessToken;
    private String connectorRefreshToken;
    private String previousRefreshToken;
    private String apiAccessToken;
    private String lastSecondFactorCode;

    public ConnectedAppsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, TotpCodes totpCodes,
                                        DonorPasskeyStepDefinitions passkeys) {
        this.api = api;
        this.totpCodes = totpCodes;
        this.passkeys = passkeys;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
    }

    @When("anyone reads the authorization server metadata")
    public void anyoneReadsTheAuthorizationServerMetadata() {
        api.forgetCredentials();
        api.get(METADATA_PATH);
    }

    @Then("the metadata names the issuer {string} with the authorization page {string} and the token endpoint {string}")
    public void theMetadataNamesTheIssuer(String issuer, String authorizationPage, String tokenEndpoint) {
        JsonNode metadata = api.lastResponseJson();
        assertThat(metadata.get("issuer").asString()).isEqualTo(issuer);
        assertThat(metadata.get("authorization_endpoint").asString()).isEqualTo(issuer + authorizationPage);
        assertThat(metadata.get("token_endpoint").asString()).isEqualTo(issuer + tokenEndpoint);
    }

    @Then("the metadata supports Client ID Metadata Documents, public clients, PKCE {string} and the scopes {string}")
    public void theMetadataSupports(String challengeMethod, String scopes) {
        JsonNode metadata = api.lastResponseJson();
        assertThat(metadata.get("client_id_metadata_document_supported").asBoolean()).isTrue();
        assertThat(metadata.get("authorization_response_iss_parameter_supported").asBoolean()).isTrue();
        assertThat(strings(metadata.get("token_endpoint_auth_methods_supported"))).containsExactly("none");
        assertThat(strings(metadata.get("code_challenge_methods_supported"))).containsExactly(challengeMethod);
        assertThat(strings(metadata.get("scopes_supported"))).containsExactly(scopes.split(" "));
        assertThat(strings(metadata.get("response_types_supported"))).containsExactly("code");
        assertThat(strings(metadata.get("grant_types_supported"))).containsExactlyInAnyOrder("authorization_code", "refresh_token", TOKEN_EXCHANGE);
    }

    @When("{string} asks about the client {string} redirecting to {string}")
    public void asksAboutTheClient(String alias, String client, String redirect) {
        sessions.actAs(alias);
        api.get(CLIENT_PATH + "?clientId=" + client + "&redirectUri=" + redirect);
    }

    @Given("{string} asked about the client {string} redirecting to {string} {int} times")
    public void askedAboutTheClientTimes(String alias, String client, String redirect, int times) {
        for (int i = 0; i < times; i++) {
            asksAboutTheClient(alias, client, redirect);
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        }
    }

    @Then("the client is described as host {string} named {string} and not on this computer")
    public void theClientIsDescribedAsRemote(String host, String name) {
        assertClientDescription(host, name, false);
    }

    @Then("the client is described as host {string} named {string} and on this computer")
    public void theClientIsDescribedAsLocal(String host, String name) {
        assertClientDescription(host, name, true);
    }

    @When("{string} approves the connection for {string} with scope {string} and state {string}")
    public void approvesTheConnection(String alias, String client, String scope, String state) {
        decide(alias, client, defaultRedirectOf(client), scope, MCP_RESOURCE, state, challenge(VERIFIER), true);
    }

    @When("{string} approves the connection for {string} with scope {string} for the resource {string}")
    public void approvesTheConnectionForTheResource(String alias, String client, String scope, String resource) {
        decide(alias, client, defaultRedirectOf(client), scope, resource, DEFAULT_STATE, challenge(VERIFIER), true);
    }

    @When("{string} approves the connection for {string} without a code challenge")
    public void approvesTheConnectionWithoutACodeChallenge(String alias, String client) {
        decide(alias, client, defaultRedirectOf(client), "admin:read", MCP_RESOURCE, DEFAULT_STATE, null, true);
    }

    @When("{string} approves the connection for {string} redirecting to {string}")
    public void approvesTheConnectionRedirectingTo(String alias, String client, String redirect) {
        decide(alias, client, redirect, "admin:read", MCP_RESOURCE, DEFAULT_STATE, challenge(VERIFIER), true);
    }

    @When("{string} approves the connection for {string} without confirming it again")
    public void approvesTheConnectionWithoutConfirmingItAgain(String alias, String client) {
        sessions.actAs(alias);
        postDecision(client, defaultRedirectOf(client), "admin:read", MCP_RESOURCE, DEFAULT_STATE, challenge(VERIFIER), true, Map.of());
    }

    @When("{string} approves the connection for {string} with the code {string}")
    public void approvesTheConnectionWithTheCode(String alias, String client, String presentedCode) {
        sessions.actAs(alias);
        postDecision(client, defaultRedirectOf(client), "admin:read", MCP_RESOURCE, DEFAULT_STATE, challenge(VERIFIER), true,
                Map.of("secondFactorCode", presentedCode));
    }

    @When("{string} approves the connection for {string} again with the same code")
    public void approvesTheConnectionAgainWithTheSameCode(String alias, String client) {
        approvesTheConnectionWithTheCode(alias, client, lastSecondFactorCode);
    }

    @When("{string} approves the connection for {string} with the passkey {string}")
    public void approvesTheConnectionWithThePasskey(String alias, String client, String name) {
        sessions.actAs(alias);
        Map<String, Object> answer = passkeys.passkeyConfirmation(alias, name);
        postDecision(client, defaultRedirectOf(client), "admin:read", MCP_RESOURCE, DEFAULT_STATE, challenge(VERIFIER), true, Map.of("passkey", answer));
    }

    @Given("{string} approved the connection for {string}")
    public void approvedTheConnection(String alias, String client) {
        approvesTheConnection(alias, client, "admin:read", DEFAULT_STATE);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Approving answered %s", api.lastResponse().getBody()).isEqualTo(200);
        rememberCodeFromRedirect();
    }

    @When("{string} declines the connection for {string} with state {string}")
    public void declinesTheConnection(String alias, String client, String state) {
        decide(alias, client, defaultRedirectOf(client), "admin:read", MCP_RESOURCE, state, challenge(VERIFIER), false);
    }

    @Then("the approval redirects to {string} with a code, the state {string} and the issuer {string}")
    public void theApprovalRedirectsTo(String redirect, String state, String issuer) {
        Map<String, String> query = redirectQuery(redirect);
        assertThat(query).containsEntry("state", state).containsEntry("iss", issuer).containsKey("code").doesNotContainKey("error");
        code = query.get("code");
    }

    @Then("the decision redirects to {string} with the error {string} and the state {string}")
    public void theDecisionRedirectsToWithTheError(String redirect, String error, String state) {
        Map<String, String> query = redirectQuery(redirect);
        assertThat(query).containsEntry("error", error).containsEntry("state", state).containsEntry("iss", ISSUER).doesNotContainKey("code");
    }

    @When("the application exchanges the code with the right verifier")
    public void theApplicationExchangesTheCodeWithTheRightVerifier() {
        exchangeCode(code, clientId, redirectUri, VERIFIER);
    }

    @When("the application exchanges the code with a wrong verifier")
    public void theApplicationExchangesTheCodeWithAWrongVerifier() {
        exchangeCode(code, clientId, redirectUri, "wrong-" + VERIFIER.substring(6));
    }

    @When("the application exchanges the code as the client {string}")
    public void theApplicationExchangesTheCodeAsTheClient(String otherClient) {
        exchangeCode(code, otherClient, redirectUri, VERIFIER);
    }

    @When("the application exchanges the code {string} with the right verifier")
    public void theApplicationExchangesTheGivenCode(String presentedCode) {
        exchangeCode(presentedCode, clientId, redirectUri, VERIFIER);
    }

    @When("the application asks for the grant type {string}")
    public void theApplicationAsksForTheGrantType(String grantType) {
        api.forgetCredentials();
        api.postForm(TOKEN_PATH, Map.of("grant_type", grantType, "client_id", FakeClientMetadataSource.CLAUDE));
    }

    @Given("{int} token requests were made from this address")
    public void tokenRequestsWereMadeFromThisAddress(int count) {
        for (int i = 0; i < count; i++) {
            theApplicationAsksForTheGrantType("client_credentials");
        }
    }

    @Given("{string} connected the application {string}")
    public void connectedTheApplication(String alias, String client) {
        connectedTheApplicationWithScope(alias, client, "admin:read");
    }

    @Given("{string} connected the application {string} with scope {string}")
    public void connectedTheApplicationWithScope(String alias, String client, String scope) {
        approvesTheConnection(alias, client, scope, DEFAULT_STATE);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Approving answered %s", api.lastResponse().getBody()).isEqualTo(200);
        rememberCodeFromRedirect();
        theApplicationExchangesTheCodeWithTheRightVerifier();
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The code exchange answered %s", api.lastResponse().getBody())
                .isEqualTo(200);
        rememberTokens();
    }

    @Then("the token response carries a bearer token for {int} minutes, a refresh token and the scope {string}")
    public void theTokenResponseCarries(int minutes, String scope) {
        JsonNode tokens = api.lastResponseJson();
        assertThat(tokens.get("token_type").asString()).isEqualTo("Bearer");
        assertThat(tokens.get("expires_in").asLong()).isEqualTo(minutes * 60L);
        assertThat(tokens.get("access_token").asString()).isNotBlank();
        assertThat(tokens.get("refresh_token").asString()).isNotBlank();
        assertThat(tokens.get("scope").asString()).isEqualTo(scope);
        assertThat(api.lastResponse().getHeaders().getCacheControl()).isEqualTo("no-store");
        rememberTokens();
    }

    @Then("the refresh token differs from the previous one")
    public void theRefreshTokenDiffersFromThePreviousOne() {
        assertThat(connectorRefreshToken).isNotEqualTo(previousRefreshToken);
    }

    @Then("the connector token does not open the administration")
    public void theConnectorTokenDoesNotOpenTheAdministration() {
        api.forgetCredentials();
        api.authorize(connectorAccessToken);
        ResponseEntity<String> response = api.get(ADMIN_PATH + "?query=Jana");
        assertThat(response.getStatusCode().value()).withFailMessage("The administration answered %s", response.getBody()).isEqualTo(401);
    }

    @When("the connector exchanges the connector token for an API token")
    public void theConnectorExchangesTheConnectorTokenForAnApiToken() {
        exchangeToken(connectorAccessToken, API_RESOURCE);
    }

    @When("the connector exchanges the connector token for the resource {string}")
    public void theConnectorExchangesTheConnectorTokenForTheResource(String resource) {
        exchangeToken(connectorAccessToken, resource);
    }

    @When("the connector exchanges the browser token of {string} for an API token")
    public void theConnectorExchangesTheBrowserTokenForAnApiToken(String alias) {
        exchangeToken(scenarioDonors.accessTokenOf(alias), API_RESOURCE);
    }

    @Then("the exchanged API token opens the administration")
    public void theExchangedApiTokenOpensTheAdministration() {
        JsonNode tokens = api.lastResponseJson();
        assertThat(tokens.get("issued_token_type").asString()).isEqualTo(ACCESS_TOKEN_TYPE);
        assertThat(tokens.get("token_type").asString()).isEqualTo("Bearer");
        assertThat(tokens.has("refresh_token")).isFalse();
        apiAccessToken = tokens.get("access_token").asString();
        api.forgetCredentials();
        api.authorize(apiAccessToken);
        ResponseEntity<String> response = api.get(ADMIN_PATH + "?query=Jana");
        assertThat(response.getStatusCode().value()).withFailMessage("The administration answered %s", response.getBody()).isEqualTo(200);
    }

    @When("the exchanged API token tries to erase an unknown donor")
    public void theExchangedApiTokenTriesToEraseAnUnknownDonor() {
        apiAccessToken = api.lastResponseJson().get("access_token").asString();
        api.forgetCredentials();
        api.authorize(apiAccessToken);
        api.delete(ADMIN_PATH + "/" + UUID.randomUUID());
    }

    @When("the exchanged API token sends {word} {string}")
    public void theExchangedApiTokenSends(String method, String path) {
        actAsExchangedApiToken();
        String target = path.replace("{id}", UUID.randomUUID().toString());
        switch (method) {
            case "POST" -> api.post(target, Map.of());
            case "PUT" -> api.put(target, Map.of());
            case "DELETE" -> api.delete(target);
            case "GET" -> api.get(target);
            default -> throw new IllegalArgumentException("Unsupported method " + method);
        }
    }

    @When("the exchanged API token tries to approve the connection for {string} with scope {string}")
    public void theExchangedApiTokenTriesToApproveTheConnection(String client, String scope) {
        actAsExchangedApiToken();
        postDecision(client, defaultRedirectOf(client), scope, MCP_RESOURCE, DEFAULT_STATE, challenge(VERIFIER), true, Map.of());
    }

    @When("the exchanged API token reads the account of the administrator")
    public void theExchangedApiTokenReadsTheAccountOfTheAdministrator() {
        actAsExchangedApiToken();
        api.get("/api/donors/me");
    }

    @When("the exchanged API token tries to download the backup {string}")
    public void theExchangedApiTokenTriesToDownloadTheBackup(String fileName) {
        actAsExchangedApiToken();
        api.get(BACKUPS_PATH + "/" + fileName);
    }

    @When("the exchanged API token tries to restore the backup {string}")
    public void theExchangedApiTokenTriesToRestoreTheBackup(String fileName) {
        actAsExchangedApiToken();
        api.post(BACKUPS_PATH + "/" + fileName + "/restore", Map.of());
    }

    @When("the exchanged API token changes the setting {string} to {string}")
    public void theExchangedApiTokenChangesTheSetting(String name, String value) {
        actAsExchangedApiToken();
        api.put("/api/admin/operations/settings", Map.of("changes", List.of(Map.of("name", name, "value", value))));
    }

    @When("the exchanged API token sends a test e-mail with the password {string}")
    public void theExchangedApiTokenSendsATestEmailWithThePassword(String password) {
        actAsExchangedApiToken();
        api.post("/api/admin/operations/settings/test-email", Map.of("host", "smtp.example.cz", "port", 587, "username", "user",
                "password", password, "auth", true, "startTls", true, "sender", "info@nfnn.cz"));
    }

    @When("the exchanged API token sends a test e-mail through the running mail server")
    public void theExchangedApiTokenSendsATestEmailThroughTheRunningMailServer() {
        actAsExchangedApiToken();
        api.post("/api/admin/operations/settings/test-email", Map.of("host", "localhost", "port", 1025, "username", "",
                "auth", false, "startTls", false, "sender", "info@nfnn.cz"));
    }

    @When("the exchanged API token sets the logger {string} to {string} for {int} minutes")
    public void theExchangedApiTokenSetsTheLogger(String logger, String level, int minutes) {
        actAsExchangedApiToken();
        api.put("/api/admin/operations/loggers/" + logger, Map.of("level", level, "minutes", minutes));
    }

    @When("the exchanged API token lists the backups")
    public void theExchangedApiTokenListsTheBackups() {
        actAsExchangedApiToken();
        api.get(BACKUPS_PATH);
    }

    @Then("the API token cannot be exchanged again")
    public void theApiTokenCannotBeExchangedAgain() {
        exchangeToken(apiAccessToken, API_RESOURCE);
        assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(400);
        assertThat(api.lastResponseJson().get("error").asString()).isEqualTo("invalid_grant");
    }

    @When("the application refreshes its tokens")
    public void theApplicationRefreshesItsTokens() {
        refresh(connectorRefreshToken, clientId);
    }

    @When("the application refreshes its tokens with the previous refresh token")
    public void theApplicationRefreshesItsTokensWithThePreviousRefreshToken() {
        refresh(previousRefreshToken, clientId);
    }

    @When("the application refreshes its tokens as the client {string}")
    public void theApplicationRefreshesItsTokensAsTheClient(String otherClient) {
        refresh(connectorRefreshToken, otherClient);
    }

    @When("the application's refresh token is presented as the browser's refresh cookie")
    public void theApplicationsRefreshTokenIsPresentedAsTheBrowsersRefreshCookie() {
        api.forgetCredentials();
        api.sendCookie("refresh_token=" + connectorRefreshToken);
        api.post(REFRESH_PATH, Map.of());
    }

    @When("the browser session of {string} is refreshed")
    public void theBrowserSessionIsRefreshed(String alias) {
        api.forgetCredentials();
        api.sendCookie(sessions.refreshCookieOf(alias));
        api.post(REFRESH_PATH, Map.of());
    }

    @Then("the token error is {string}")
    public void theTokenErrorIs(String error) {
        assertThat(api.lastResponseJson().get("error").asString()).isEqualTo(error);
        assertThat(api.lastResponseJson().get("error_description").asString()).isEqualTo(TOKEN_ERROR_DESCRIPTIONS.get(error));
        assertThat(api.lastResponse().getHeaders().getCacheControl()).isEqualTo("no-store");
    }

    @When("{string} lists the connected applications")
    public void listsTheConnectedApplications(String alias) {
        sessions.actAs(alias);
        api.get(CONNECTIONS_PATH);
    }

    @Then("the connected applications are {string} with scope {string}")
    public void theConnectedApplicationsAre(String client, String scope) {
        JsonNode items = api.lastResponseJson().get("items");
        assertThat(items).hasSize(1);
        JsonNode item = items.get(0);
        assertThat(item.get("client").asString()).isEqualTo(client);
        assertThat(strings(item.get("scopes"))).containsExactly(scope.split(" "));
        assertThat(item.get("id").asString()).isNotBlank();
        assertThat(item.get("grantedAt").asString()).isNotBlank();
        assertThat(item.get("lastUsedAt").asString()).isNotBlank();
        assertThat(item.get("expiresAt").asString()).isNotBlank();
    }

    @Then("the connected applications are {string} with scopes {string} and {string}")
    public void theConnectedApplicationsAreWithScopes(String client, String firstScopes, String secondScopes) {
        JsonNode items = api.lastResponseJson().get("items");
        assertThat(items).hasSize(2);
        assertThat(items.valueStream().map(item -> item.get("client").asString())).containsOnly(client);
        assertThat(items.valueStream().map(item -> String.join(" ", strings(item.get("scopes")))))
                .containsExactlyInAnyOrder(firstScopes, secondScopes);
    }

    @Then("no application is connected")
    public void noApplicationIsConnected() {
        assertThat(api.lastResponseJson().get("items")).isEmpty();
    }

    @When("{string} disconnects the application of {string}")
    public void disconnectsTheApplicationOf(String alias, String owner) {
        listsTheConnectedApplications(owner);
        JsonNode items = api.lastResponseJson().get("items");
        assertThat(items).withFailMessage("%s has no connected application", owner).isNotEmpty();
        String id = items.get(0).get("id").asString();
        sessions.actAs(alias);
        api.delete(CONNECTIONS_PATH + "/" + id);
    }

    private void actAsExchangedApiToken() {
        if (api.lastResponseJson().has("access_token")) {
            apiAccessToken = api.lastResponseJson().get("access_token").asString();
        }
        api.forgetCredentials();
        api.authorize(apiAccessToken);
    }

    private void decide(String alias, String client, String redirect, String scope, String resource, String state, String codeChallenge,
                        boolean approved) {
        sessions.actAs(alias);
        Map<String, Object> proof = new HashMap<>();
        if (approved && scenarioDonors.hasSecondFactor(alias)) {
            lastSecondFactorCode = totpCodes.freshCode(scenarioDonors.secondFactorSecretOf(alias));
            proof.put("secondFactorCode", lastSecondFactorCode);
        }
        postDecision(client, redirect, scope, resource, state, codeChallenge, approved, proof);
    }

    private void postDecision(String client, String redirect, String scope, String resource, String state, String codeChallenge,
                              boolean approved, Map<String, Object> proof) {
        clientId = client;
        redirectUri = redirect;
        Map<String, Object> body = new HashMap<>();
        body.put("clientId", client);
        body.put("redirectUri", redirect);
        body.put("responseType", "code");
        body.put("scope", scope);
        body.put("resource", resource);
        body.put("state", state);
        body.put("approved", approved);
        if (codeChallenge != null) {
            body.put("codeChallenge", codeChallenge);
            body.put("codeChallengeMethod", "S256");
        }
        body.putAll(proof);
        api.post(AUTHORIZE_PATH, body);
    }

    private void exchangeCode(String presentedCode, String client, String redirect, String verifier) {
        api.forgetCredentials();
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", "authorization_code");
        form.put("code", presentedCode);
        form.put("client_id", client);
        form.put("redirect_uri", redirect);
        form.put("code_verifier", verifier);
        form.put("resource", MCP_RESOURCE);
        api.postForm(TOKEN_PATH, form);
    }

    private void exchangeToken(String subjectToken, String resource) {
        api.forgetCredentials();
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", TOKEN_EXCHANGE);
        form.put("subject_token", subjectToken);
        form.put("subject_token_type", ACCESS_TOKEN_TYPE);
        form.put("resource", resource);
        api.postForm(TOKEN_PATH, form);
    }

    private void refresh(String refreshToken, String client) {
        api.forgetCredentials();
        api.postForm(TOKEN_PATH, Map.of("grant_type", "refresh_token", "refresh_token", refreshToken, "client_id", client));
    }

    private void rememberCodeFromRedirect() {
        code = redirectQuery(redirectUri).get("code");
        assertThat(code).withFailMessage("The approval redirected without a code: %s", api.lastResponse().getBody()).isNotBlank();
    }

    private void rememberTokens() {
        JsonNode tokens = api.lastResponseJson();
        connectorAccessToken = tokens.get("access_token").asString();
        previousRefreshToken = connectorRefreshToken;
        connectorRefreshToken = tokens.get("refresh_token").asString();
    }

    private Map<String, String> redirectQuery(String expectedRedirect) {
        URI target = URI.create(api.lastResponseJson().get("redirectTo").asString());
        assertThat(target.toString()).startsWith(expectedRedirect + "?");
        return Arrays.stream(target.getRawQuery().split("&"))
                .map(pair -> pair.split("=", 2))
                .collect(Collectors.toMap(pair -> pair[0], pair -> URLDecoder.decode(pair[1], StandardCharsets.UTF_8)));
    }

    private void assertClientDescription(String host, String name, boolean loopback) {
        JsonNode description = api.lastResponseJson();
        assertThat(description.get("host").asString()).isEqualTo(host);
        assertThat(description.get("name").asString()).isEqualTo(name);
        assertThat(description.get("loopback").asBoolean()).isEqualTo(loopback);
    }

    private static String defaultRedirectOf(String client) {
        return FakeClientMetadataSource.CLAUDE_CODE.equals(client) ? "http://localhost:3118/callback" : FakeClientMetadataSource.CLAUDE_CALLBACK;
    }

    private static String challenge(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException(missing);
        }
    }

    private static List<String> strings(JsonNode array) {
        return array.valueStream().map(JsonNode::asString).toList();
    }
}
