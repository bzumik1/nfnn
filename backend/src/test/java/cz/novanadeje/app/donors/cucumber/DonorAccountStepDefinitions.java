package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class DonorAccountStepDefinitions {

    private static final String REGISTER_PATH = "/api/donors/auth/register";
    private static final String LOGIN_PATH = "/api/donors/auth/login";
    private static final String REFRESH_PATH = "/api/donors/auth/refresh";
    private static final String LOGOUT_PATH = "/api/donors/auth/logout";
    private static final String PROFILE_PATH = "/api/donors/me";

    private final ApiClient api;
    private String currentRefreshCookie;
    private String previousRefreshCookie;

    public DonorAccountStepDefinitions(ApiClient api) {
        this.api = api;
    }

    @When("a person registers")
    public void aPersonRegisters(Map<String, String> fields) {
        api.post(REGISTER_PATH, registration("PERSON", fields));
    }

    @When("a company registers")
    public void aCompanyRegisters(Map<String, String> fields) {
        api.post(REGISTER_PATH, registration("COMPANY", fields));
    }

    @Given("a person registered with email {string} and password {string}")
    public void aPersonRegisteredWith(String email, String password) {
        registerPerson(email, password, "Jana Nováková", null);
    }

    @Given("people registered with these emails:")
    public void peopleRegisteredWithTheseEmails(List<String> emails) {
        emails.forEach(email -> registerPerson(email, "correct horse battery", "Jana Nováková", null));
    }

    @When("a person registers with email {string} and password {string}")
    public void aPersonRegistersWithEmailAndPassword(String email, String password) {
        api.forgetCredentials();
        api.post(REGISTER_PATH, registration("PERSON", personFields(email, password, "Jana Nováková", null)));
    }

    @Given("a person registered with email {string}, password {string} and name {string}")
    public void aPersonRegisteredWithName(String email, String password, String name) {
        registerPerson(email, password, name, null);
    }

    @Given("a person registered with email {string}, password {string} and preferred locale {string}")
    public void aPersonRegisteredWithPreferredLocale(String email, String password, String preferredLocale) {
        registerPerson(email, password, "Jana Nováková", preferredLocale);
    }

    @When("the donor signs in with email {string} and password {string}")
    public void theDonorSignsIn(String email, String password) {
        api.forgetCredentials();
        ResponseEntity<String> response = api.post(LOGIN_PATH, Map.of("email", email, "password", password));
        if (response.getStatusCode().is2xxSuccessful()) {
            adoptSession(response);
        }
    }

    @Given("the donor signed in with email {string} and password {string}")
    public void theDonorSignedIn(String email, String password) {
        theDonorSignsIn(email, password);
        assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
    }

    @Given("{int} sign-in attempts were made with email {string} and password {string}")
    public void signInAttemptsWereMade(int attempts, String email, String password) {
        for (int i = 0; i < attempts; i++) {
            theDonorSignsIn(email, password);
            assertThat(api.lastResponse().getStatusCode().value())
                    .withFailMessage("Sign-in attempt %d answered %s", i + 1, api.lastResponse().getBody())
                    .isIn(200, 401);
        }
    }

    @When("the donor asks for the profile")
    public void theDonorAsksForTheProfile() {
        api.get(PROFILE_PATH);
    }

    @When("the donor refreshes the session")
    public void theDonorRefreshesTheSession() {
        api.sendCookie(currentRefreshCookie);
        ResponseEntity<String> response = api.post(REFRESH_PATH, Map.of());
        if (response.getStatusCode().is2xxSuccessful()) {
            adoptSession(response);
        }
    }

    @When("the donor refreshes the session with the previous refresh cookie")
    public void theDonorRefreshesWithThePreviousCookie() {
        api.sendCookie(previousRefreshCookie);
        api.post(REFRESH_PATH, Map.of());
    }

    @When("the donor signs out")
    public void theDonorSignsOut() {
        api.sendCookie(currentRefreshCookie);
        api.post(LOGOUT_PATH, Map.of());
        previousRefreshCookie = currentRefreshCookie;
    }

    @When("the donor updates the profile")
    public void theDonorUpdatesTheProfile(Map<String, String> fields) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", fields.get("name"));
        body.put("address", Map.of(
                "street", fields.get("street"),
                "city", fields.get("city"),
                "postalCode", fields.get("postalCode")
        ));
        api.patch(PROFILE_PATH, body);
    }

    @Then("the response carries an access token and a refresh cookie")
    public void theResponseCarriesAnAccessTokenAndARefreshCookie() {
        JsonNode body = api.lastResponseJson();
        assertThat(body.get("accessToken").asString()).isNotBlank();
        assertThat(body.get("accessTokenExpiresAt").asString()).isNotBlank();
        String setCookie = refreshSetCookie(api.lastResponse());
        assertThat(setCookie).contains("HttpOnly").contains("Secure").contains("SameSite=Strict").contains("Path=/api/donors/auth");
        adoptSession(api.lastResponse());
    }

    @And("the refresh cookie differs from the previous one")
    public void theRefreshCookieDiffersFromThePreviousOne() {
        assertThat(currentRefreshCookie).isNotEqualTo(previousRefreshCookie);
    }

    @And("the refresh cookie is cleared")
    public void theRefreshCookieIsCleared() {
        String setCookie = refreshSetCookie(api.lastResponse());
        assertThat(setCookie).contains("Max-Age=0");
    }

    @And("the registered donor has a 10-digit variable symbol")
    public void theRegisteredDonorHasATenDigitVariableSymbol() {
        assertThat(api.lastResponseJson().get("user").get("variableSymbol").asString()).matches("[1-9][0-9]{9}");
    }

    @And("the donor profile shows type {string}, name {string} and email {string}")
    public void theDonorProfileShowsTypeNameAndEmail(String type, String name, String email) {
        JsonNode profile = profile();
        assertThat(profile.get("type").asString()).isEqualTo(type);
        assertThat(profile.get("name").asString()).isEqualTo(name);
        assertThat(profile.get("email").asString()).isEqualTo(email);
        assertThat(profile.get("roles").valueStream().map(JsonNode::asString).toList()).isEqualTo(List.of("DONOR"));
    }

    @And("the donor profile shows type {string}, name {string} and company identifier {string}")
    public void theDonorProfileShowsTypeNameAndCompanyIdentifier(String type, String name, String companyIdentifier) {
        JsonNode profile = profile();
        assertThat(profile.get("type").asString()).isEqualTo(type);
        assertThat(profile.get("name").asString()).isEqualTo(name);
        assertThat(profile.get("companyIdentifier").asString()).isEqualTo(companyIdentifier);
    }

    @And("the donor profile shows street {string}")
    public void theDonorProfileShowsStreet(String street) {
        assertThat(profile().get("address").get("street").asString()).isEqualTo(street);
    }

    private JsonNode profile() {
        ResponseEntity<String> response = api.get(PROFILE_PATH);
        assertThat(response.getStatusCode().value()).withFailMessage("Profile answered %s", response.getBody()).isEqualTo(200);
        return api.lastResponseJson();
    }

    private void adoptSession(ResponseEntity<String> response) {
        api.authorize(api.lastResponseJson().get("accessToken").asString());
        String refreshCookie = refreshSetCookie(response).split(";", 2)[0];
        if (!refreshCookie.equals(currentRefreshCookie)) {
            previousRefreshCookie = currentRefreshCookie;
            currentRefreshCookie = refreshCookie;
        }
    }

    private static String refreshSetCookie(ResponseEntity<String> response) {
        List<String> cookies = response.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE);
        return cookies.stream()
                .filter(cookie -> cookie.startsWith("refresh_token="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No refresh_token cookie in " + cookies));
    }

    private void registerPerson(String email, String password, String name, String preferredLocale) {
        ResponseEntity<String> response = api.post(REGISTER_PATH, registration("PERSON", personFields(email, password, name, preferredLocale)));
        assertThat(response.getStatusCode().value()).withFailMessage("Registration answered %s", response.getBody()).isEqualTo(201);
        api.forgetCredentials();
    }

    private static Map<String, String> personFields(String email, String password, String name, String preferredLocale) {
        Map<String, String> fields = new HashMap<>();
        fields.put("name", name);
        fields.put("street", "Dlouhá 12");
        fields.put("city", "Ústí nad Labem");
        fields.put("postalCode", "400 01");
        fields.put("email", email);
        fields.put("password", password);
        fields.put("preferredLocale", preferredLocale);
        return fields;
    }

    private static Map<String, Object> registration(String type, Map<String, String> fields) {
        Map<String, Object> body = new HashMap<>();
        body.put("type", type);
        body.put("name", fields.get("name"));
        body.put("companyIdentifier", fields.get("companyIdentifier"));
        body.put("address", Map.of(
                "street", fields.get("street"),
                "city", fields.get("city"),
                "postalCode", fields.get("postalCode")
        ));
        body.put("email", fields.get("email"));
        body.put("password", fields.get("password"));
        body.put("preferredLocale", fields.get("preferredLocale"));
        return body;
    }
}
