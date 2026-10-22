package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.SecondFactorEnrolments;
import cz.novanadeje.app.cucumber.TotpCodes;
import cz.novanadeje.app.shared.QrCodes;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class DonorSecondFactorStepDefinitions {

    private static final String LOGIN_PATH = "/api/donors/auth/login";
    private static final String SECOND_FACTOR_LOGIN_PATH = "/api/donors/auth/login/second-factor";
    private static final String DISABLE_PATH = "/api/donors/me/second-factor/disable";
    private static final String PROFILE_PATH = "/api/donors/me";
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};

    private final ApiClient api;
    private final TotpCodes totpCodes;
    private final JdbcClient jdbc;
    private final Clock clock;
    private final DonorAccountStepDefinitions accounts;
    private String secret;
    private String challenge;

    public DonorSecondFactorStepDefinitions(ApiClient api, TotpCodes totpCodes, JdbcClient jdbc, Clock clock, DonorAccountStepDefinitions accounts) {
        this.api = api;
        this.totpCodes = totpCodes;
        this.jdbc = jdbc;
        this.clock = clock;
        this.accounts = accounts;
    }

    @Given("the donor with email {string} is given the administrator role")
    public void theDonorWithEmailIsGivenTheAdministratorRole(String email) {
        jdbc.sql("insert into donor_role (donor_id, role) select id, 'ADMIN' from donor where email = ? on conflict do nothing").param(email).update();
    }

    @When("the donor starts the second factor set-up with password {string}")
    public void theDonorStartsTheSecondFactorSetUp(String password) {
        ResponseEntity<String> response = api.post(SecondFactorEnrolments.SETUP_PATH, Map.of("password", password));
        if (response.getStatusCode().is2xxSuccessful()) {
            secret = api.lastResponseJson().get("secret").asString();
        }
    }

    @Given("the donor started the second factor set-up with password {string} {int} times")
    public void theDonorStartedTheSecondFactorSetUpTimes(String password, int times) {
        for (int i = 0; i < times; i++) {
            theDonorStartsTheSecondFactorSetUp(password);
            assertThat(api.lastResponse().getStatusCode().value()).isIn(200, 400);
        }
    }

    @When("the donor confirms the second factor with the current code")
    public void theDonorConfirmsTheSecondFactorWithTheCurrentCode() {
        theDonorConfirmsTheSecondFactorWithCode(totpCodes.currentCode(secret));
    }

    @When("the donor confirms the second factor with code {string}")
    public void theDonorConfirmsTheSecondFactorWithCode(String code) {
        api.post(SecondFactorEnrolments.CONFIRM_PATH, Map.of("code", code));
    }

    @Given("the donor turned the second factor on with password {string}")
    public void theDonorTurnedTheSecondFactorOn(String password) {
        theDonorStartsTheSecondFactorSetUp(password);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Set-up answered %s", api.lastResponse().getBody()).isEqualTo(200);
        theDonorConfirmsTheSecondFactorWithTheCurrentCode();
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Confirmation answered %s", api.lastResponse().getBody()).isEqualTo(200);
        accounts.theResponseCarriesAnAccessTokenAndARefreshCookie();
    }

    @When("the donor turns the second factor off with password {string} and the current code")
    public void theDonorTurnsTheSecondFactorOffWithTheCurrentCode(String password) {
        theDonorTurnsTheSecondFactorOffWithCode(password, totpCodes.currentCode(secret));
    }

    @When("the donor turns the second factor off with password {string} and code {string}")
    public void theDonorTurnsTheSecondFactorOffWithCode(String password, String code) {
        api.post(DISABLE_PATH, Map.of("password", password, "code", code));
    }

    @Given("the donor signed in with email {string} and password {string} up to the code")
    public void theDonorSignedInUpToTheCode(String email, String password) {
        api.forgetCredentials();
        ResponseEntity<String> response = api.post(LOGIN_PATH, Map.of("email", email, "password", password));
        assertThat(response.getStatusCode().value()).withFailMessage("Sign-in answered %s", response.getBody()).isEqualTo(401);
        rememberChallenge();
    }

    @And("the donor is asked for the code with a challenge that expires in {int} minutes")
    public void theDonorIsAskedForTheCodeWithAChallengeThatExpiresIn(int minutes) {
        rememberChallenge();
        JsonNode problem = api.lastResponseJson();
        assertThat(problem.get("challenge").asString()).hasSize(43);
        assertThat(Instant.parse(problem.get("challengeExpiresAt").asString())).isEqualTo(clock.instant().plus(Duration.ofMinutes(minutes)));
        assertThat(problem.has("accessToken")).isFalse();
    }

    @And("no refresh cookie is set")
    public void noRefreshCookieIsSet() {
        List<String> cookies = api.lastResponse().getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE);
        assertThat(cookies).noneMatch(cookie -> cookie.startsWith("refresh_token="));
    }

    @When("the donor completes the sign-in with the current code")
    public void theDonorCompletesTheSignInWithTheCurrentCode() {
        theDonorCompletesTheSignInWithCode(totpCodes.currentCode(secret));
    }

    @When("the donor completes the sign-in with code {string}")
    public void theDonorCompletesTheSignInWithCode(String code) {
        api.forgetCredentials();
        ResponseEntity<String> response = api.post(SECOND_FACTOR_LOGIN_PATH, Map.of("challenge", challenge, "code", code));
        if (response.getStatusCode().is2xxSuccessful()) {
            api.authorize(api.lastResponseJson().get("accessToken").asString());
        }
    }

    @Given("the donor completed the sign-in with code {string} {int} times")
    public void theDonorCompletedTheSignInWithCodeTimes(String code, int times) {
        for (int i = 0; i < times; i++) {
            theDonorCompletesTheSignInWithCode(code);
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(401);
        }
    }

    @Then("the set-up answers with a secret, an otpauth link for {string} issued by {string} and a QR code of that link")
    public void theSetUpAnswersWithASecretAnOtpauthLinkAndAQrCode(String account, String issuer) {
        JsonNode body = api.lastResponseJson();
        assertThat(body.get("secret").asString()).matches("[A-Z2-7]{32}");
        String uri = body.get("otpauthUri").asString();
        assertThat(URLDecoder.decode(uri, StandardCharsets.UTF_8))
                .isEqualTo("otpauth://totp/" + issuer + ":" + account + "?secret=" + secret + "&issuer=" + issuer + "&algorithm=SHA1&digits=6&period=30");
        byte[] png = Base64.getDecoder().decode(body.get("qrPngBase64").asString());
        assertThat(Arrays.copyOf(png, PNG_SIGNATURE.length)).isEqualTo(PNG_SIGNATURE);
        assertThat(QrCodes.decode(png)).isEqualTo(uri);
    }

    @Then("the donor profile shows roles {string} and the second factor {onOff}")
    public void theDonorProfileShowsRolesAndTheSecondFactor(String roles, boolean enabled) {
        JsonNode profile = profile();
        assertThat(profile.get("roles").valueStream().map(JsonNode::asString).toList()).isEqualTo(Arrays.asList(roles.split(", ")));
        assertThat(profile.get("secondFactor").get("enabled").asBoolean()).isEqualTo(enabled);
    }

    @Then("the donor profile says the second factor is needed for administration")
    public void theDonorProfileSaysTheSecondFactorIsNeededForAdministration() {
        assertThat(profile().get("secondFactor").get("neededForAdministration").asBoolean()).isTrue();
    }

    @Then("the donor profile says the second factor is not needed for administration")
    public void theDonorProfileSaysTheSecondFactorIsNotNeededForAdministration() {
        assertThat(profile().get("secondFactor").get("neededForAdministration").asBoolean()).isFalse();
    }

    private void rememberChallenge() {
        JsonNode problem = api.lastResponseJson();
        assertThat(problem.get("type").asString()).endsWith("auth/second-factor-required");
        challenge = problem.get("challenge").asString();
    }

    private JsonNode profile() {
        ResponseEntity<String> response = api.get(PROFILE_PATH);
        assertThat(response.getStatusCode().value()).withFailMessage("Profile answered %s", response.getBody()).isEqualTo(200);
        return api.lastResponseJson();
    }
}
