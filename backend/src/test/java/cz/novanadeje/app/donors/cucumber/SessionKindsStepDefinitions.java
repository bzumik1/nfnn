package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.cucumber.TotpCodes;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;

import java.time.Duration;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

public class SessionKindsStepDefinitions {

    private static final String LOGIN_PATH = "/api/donors/auth/login";
    private static final String SECOND_FACTOR_PATH = "/api/donors/auth/login/second-factor";
    private static final String REFRESH_PATH = "/api/donors/auth/refresh";
    private static final String LOGOUT_PATH = "/api/donors/auth/logout";
    private static final String ADMINISTRATION_PATH = "/api/admin/operations/settings";
    private static final String SESSION_HEADER = "Nfnn-Session";
    private static final String BROWSER_COOKIE = "refresh_token";
    private static final String APP_COOKIE = "refresh_token_app";

    private final ApiClient api;
    private final ScenarioDonors donors;
    private final TotpCodes totpCodes;
    private final MutableClock clock;
    private final Map<String, String> jar = new TreeMap<>();
    private String accessToken;

    public SessionKindsStepDefinitions(ApiClient api, ScenarioDonors donors, TotpCodes totpCodes, MutableClock clock) {
        this.api = api;
        this.donors = donors;
        this.totpCodes = totpCodes;
        this.clock = clock;
    }

    @When("{string} signs in in the installed app")
    public void signsInInTheInstalledApp(String alias) {
        signIn(alias, Optional.of("APP"));
    }

    @When("{string} signs in and is remembered")
    public void signsInAndIsRemembered(String alias) {
        signIn(alias, Optional.of("REMEMBERED"));
    }

    @When("{string} signs in for this browser session")
    public void signsInForThisBrowserSession(String alias) {
        signIn(alias, Optional.of("BROWSER"));
    }

    @When("{string} signs in on a public computer")
    public void signsInOnAPublicComputer(String alias) {
        signIn(alias, Optional.of("PUBLIC"));
    }

    @When("{string} signs in without naming the kind of session")
    public void signsInWithoutNamingTheKindOfSession(String alias) {
        signIn(alias, Optional.empty());
    }

    @When("{string} signs in naming the kind of session {string}")
    public void signsInNamingTheKindOfSession(String alias, String kind) {
        signIn(alias, Optional.of(kind));
    }

    @When("the app refreshes its session")
    public void theAppRefreshesItsSession() {
        send(Optional.of("APP"), cookies());
        api.post(REFRESH_PATH, Map.of());
        keep(api.lastResponse());
    }

    @When("the browser refreshes its session")
    public void theBrowserRefreshesItsSession() {
        send(Optional.empty(), cookies());
        api.post(REFRESH_PATH, Map.of());
        keep(api.lastResponse());
    }

    @When("the browser refreshes its session every {int} minutes {int} times")
    public void theBrowserRefreshesItsSessionEvery(int minutes, int times) {
        for (int refresh = 1; refresh <= times; refresh++) {
            clock.advance(Duration.ofMinutes(minutes));
            theBrowserRefreshesItsSession();
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Refresh %d answered %s", refresh, api.lastResponse().getBody())
                    .isEqualTo(200);
        }
    }

    @When("the browser signs out")
    public void theBrowserSignsOut() {
        send(Optional.empty(), cookies());
        api.post(LOGOUT_PATH, Map.of());
        keep(api.lastResponse());
    }

    @When("the browser presents the app's refresh token as its own")
    public void theBrowserPresentsTheAppsRefreshTokenAsItsOwn() {
        send(Optional.empty(), BROWSER_COOKIE + "=" + cookie(APP_COOKIE));
        api.post(REFRESH_PATH, Map.of());
    }

    @When("the app presents the browser's refresh token as its own")
    public void theAppPresentsTheBrowsersRefreshTokenAsItsOwn() {
        send(Optional.of("APP"), APP_COOKIE + "=" + cookie(BROWSER_COOKIE));
        api.post(REFRESH_PATH, Map.of());
    }

    @Then("the answer names the session {string}")
    public void theAnswerNamesTheSession(String kind) {
        assertThat(api.lastResponseJson().get("session").asString()).isEqualTo(kind);
    }

    @Then("the refresh cookie {string} lasts {int} days")
    public void theRefreshCookieLastsDays(String name, int days) {
        Map<String, String> attributes = setCookie(name);
        assertThat(attributes).containsEntry("max-age", String.valueOf(Duration.ofDays(days).toSeconds()));
        assertThat(attributes).containsKey("expires");
    }

    @Then("the refresh cookie {string} ends with the browser")
    public void theRefreshCookieEndsWithTheBrowser(String name) {
        assertThat(setCookie(name)).doesNotContainKeys("max-age", "expires");
    }

    @Then("the browser keeps the refresh cookies {string}")
    public void theBrowserKeepsTheRefreshCookies(String names) {
        assertThat(jar.keySet()).containsExactlyElementsOf(Arrays.stream(names.split(",")).map(String::trim).filter(name -> !name.isEmpty())
                .sorted().toList());
    }

    @Then("the session opens the administration")
    public void theSessionOpensTheAdministration() {
        api.forgetCredentials();
        api.authorize(accessToken);
        assertThat(api.get(ADMINISTRATION_PATH).getStatusCode().value()).isEqualTo(200);
    }

    private void signIn(String alias, Optional<String> kind) {
        ScenarioDonors.Credentials credentials = donors.credentialsOf(alias);
        send(Optional.empty(), cookies());
        Map<String, Object> body = new LinkedHashMap<>(Map.of("email", credentials.email(), "password", credentials.password()));
        kind.ifPresent(named -> body.put("session", named));
        ResponseEntity<String> response = api.post(LOGIN_PATH, body);
        if (response.getStatusCode().value() == 401 && api.lastResponseJson().get("type").asString().endsWith("auth/second-factor-required")) {
            Map<String, Object> second = new LinkedHashMap<>(Map.of("challenge", api.lastResponseJson().get("challenge").asString(),
                    "code", totpCodes.freshCode(donors.secondFactorSecretOf(alias))));
            kind.ifPresent(named -> second.put("session", named));
            response = api.post(SECOND_FACTOR_PATH, second);
        }
        keep(response);
    }

    private void send(Optional<String> session, String cookies) {
        api.forgetCredentials();
        session.ifPresent(named -> api.sendHeader(SESSION_HEADER, named));
        if (!cookies.isEmpty()) {
            api.sendCookie(cookies);
        }
    }

    private String cookies() {
        return jar.entrySet().stream().map(entry -> entry.getKey() + "=" + entry.getValue()).collect(Collectors.joining("; "));
    }

    private String cookie(String name) {
        String value = jar.get(name);
        assertThat(value).withFailMessage("The browser keeps no %s cookie, only %s", name, jar.keySet()).isNotNull();
        return value;
    }

    private void keep(ResponseEntity<String> response) {
        if (response.getStatusCode().value() == 200) {
            accessToken = api.lastResponseJson().get("accessToken").asString();
        }
        for (String header : setCookies(response)) {
            String[] nameAndValue = header.split(";", 2)[0].split("=", 2);
            Map<String, String> attributes = attributesOf(header);
            if ("0".equals(attributes.get("max-age")) || nameAndValue[1].isEmpty()) {
                jar.remove(nameAndValue[0]);
            } else {
                jar.put(nameAndValue[0], nameAndValue[1]);
            }
        }
    }

    private Map<String, String> setCookie(String name) {
        List<String> headers = setCookies(api.lastResponse()).stream().filter(header -> header.startsWith(name + "=")).toList();
        assertThat(headers).withFailMessage("Expected one %s cookie in %s", name, setCookies(api.lastResponse())).hasSize(1);
        return attributesOf(headers.getFirst());
    }

    private static List<String> setCookies(ResponseEntity<String> response) {
        return Optional.ofNullable(response.getHeaders().get(HttpHeaders.SET_COOKIE)).orElse(List.of());
    }

    private static Map<String, String> attributesOf(String header) {
        Map<String, String> attributes = new HashMap<>();
        String[] parts = header.split(";");
        for (int i = 1; i < parts.length; i++) {
            String[] attribute = parts[i].trim().split("=", 2);
            attributes.put(attribute[0].toLowerCase(), attribute.length > 1 ? attribute[1] : "");
        }
        return attributes;
    }
}
