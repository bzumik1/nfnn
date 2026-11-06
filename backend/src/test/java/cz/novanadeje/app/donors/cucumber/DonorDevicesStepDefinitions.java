package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.cucumber.TotpCodes;
import cz.novanadeje.app.donors.application.DonorSessionCleanupService;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class DonorDevicesStepDefinitions {

    private static final String LOGIN_PATH = "/api/donors/auth/login";
    private static final String SECOND_FACTOR_PATH = "/api/donors/auth/login/second-factor";
    private static final String REFRESH_PATH = "/api/donors/auth/refresh";
    private static final String LOGOUT_PATH = "/api/donors/auth/logout";
    private static final String PASSWORD_PATH = "/api/donors/me/password";
    private static final String PROFILE_PATH = "/api/donors/me";
    private static final String DEVICES_PATH = "/api/donors/me/devices";
    private static final String STATUS_PATH = "/api/donors/devices/status";
    private static final String ADMINISTRATION_PATH = "/api/admin/donors";
    private static final String SECRET_NO_DEVICE_HOLDS = "Zm9yZ290dGVuLWRldmljZS1zZWNyZXQtbm8tb25lLWg";
    private static final UUID UNKNOWN_DEVICE = UUID.fromString("019a5a00-0000-7000-8000-000000000001");
    private static final Map<String, String> USER_AGENTS = Map.of(
            "iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1",
            "Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0",
            "Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
            "iPad", "Mozilla/5.0 (iPad; CPU OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1",
            "Android", "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36");

    private final ApiClient api;
    private final ScenarioDonors donors;
    private final TotpCodes totpCodes;
    private final JdbcClient jdbc;
    private final DonorSessionCleanupService cleanup;
    private final MutableClock clock;
    private final Map<String, Session> sessions = new HashMap<>();

    public DonorDevicesStepDefinitions(ApiClient api, ScenarioDonors donors, TotpCodes totpCodes, JdbcClient jdbc,
                                       DonorSessionCleanupService cleanup, MutableClock clock) {
        this.api = api;
        this.donors = donors;
        this.totpCodes = totpCodes;
        this.jdbc = jdbc;
        this.cleanup = cleanup;
        this.clock = clock;
    }

    @Given("{string} signs in on the {string}")
    public void signsInOnThe(String alias, String device) {
        signIn(alias, device, Map.of());
    }

    @Given("{string} signs in on the {string} and is remembered")
    public void signsInOnTheAndIsRemembered(String alias, String device) {
        signIn(alias, device, Map.of("session", "REMEMBERED"));
    }

    @Given("{string} signs in on the {string} in a browser that forgets her")
    public void signsInOnTheInABrowserThatForgetsHer(String alias, String device) {
        signIn(alias, device, Map.of("session", "BROWSER"));
    }

    @Given("{string} signs in on the {string} in the installed app")
    public void signsInOnTheInTheInstalledApp(String alias, String device) {
        signIn(alias, device, Map.of("session", "APP"));
    }

    @When("{int} days pass with the nightly clean-up")
    public void daysPassWithTheNightlyCleanUp(int days) {
        for (int day = 0; day < days; day++) {
            clock.advance(Duration.ofDays(1));
            cleanup.cleanUp();
        }
    }

    @When("another day passes with the nightly clean-up")
    public void anotherDayPassesWithTheNightlyCleanUp() {
        daysPassWithTheNightlyCleanUp(1);
    }

    @Then("the devices answer:")
    public void theDevicesAnswer(List<Map<String, String>> rows) {
        List<Map<String, String>> answered = new ArrayList<>();
        for (Map<String, String> row : rows) {
            theDeviceAsksTheStatusOfItsSignIn(row.get("device"));
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The %s was answered %s", row.get("device"), api.lastResponse().getBody())
                    .isEqualTo(200);
            JsonNode answer = api.lastResponseJson();
            assertThat(answer.propertyNames()).containsExactlyInAnyOrder("status", "administrator");
            answered.add(Map.of("device", row.get("device"), "status", answer.get("status").asString(),
                    "administrator", String.valueOf(answer.get("administrator").asBoolean())));
        }
        assertThat(answered).containsExactlyElementsOf(rows);
    }

    private void signIn(String alias, String device, Map<String, String> session) {
        ScenarioDonors.Credentials credentials = donors.credentialsOf(alias);
        onDevice(device, null);
        Map<String, String> login = new HashMap<>(session);
        login.put("email", credentials.email());
        login.put("password", credentials.password());
        ResponseEntity<String> response = api.post(LOGIN_PATH, login);
        if (response.getStatusCode().value() == 401 && api.lastResponseJson().get("type").asString().endsWith("auth/second-factor-required")) {
            Map<String, String> secondFactor = new HashMap<>(session);
            secondFactor.put("challenge", api.lastResponseJson().get("challenge").asString());
            secondFactor.put("code", totpCodes.freshCode(donors.secondFactorSecretOf(alias)));
            response = api.post(SECOND_FACTOR_PATH, secondFactor);
        }
        assertThat(response.getStatusCode().value()).withFailMessage("Signing in on the %s answered %s", device, response.getBody()).isEqualTo(200);
        remember(device, response);
    }

    @When("{string} signs in on the {string} on a public computer")
    public void signsInOnTheOnAPublicComputer(String alias, String device) {
        ScenarioDonors.Credentials credentials = donors.credentialsOf(alias);
        onDevice(device, null);
        api.post(LOGIN_PATH, Map.of("email", credentials.email(), "password", credentials.password(), "session", "PUBLIC"));
    }

    @When("{string} signs in again on the {string} while it sends its old access token")
    public void signsInAgainWhileItSendsItsOldAccessToken(String alias, String device) {
        ScenarioDonors.Credentials credentials = donors.credentialsOf(alias);
        onDevice(device, sessionOf(device).accessToken());
        ResponseEntity<String> response = api.post(LOGIN_PATH, Map.of("email", credentials.email(), "password", credentials.password()));
        if (response.getStatusCode().value() == 200) {
            remember(device, response);
        }
    }

    @When("{string} reads the administration on the {string}")
    public void readsTheAdministrationOnThe(String alias, String device) {
        onDevice(device, sessionOf(device).accessToken());
        api.get(ADMINISTRATION_PATH);
    }

    @When("the {string} presents its spent refresh token again")
    public void theDevicePresentsItsSpentRefreshTokenAgain(String device) {
        String spent = sessionOf(device).spentRefreshCookie();
        assertThat(spent).withFailMessage("The %s has not refreshed its session in this scenario", device).isNotNull();
        onDevice(device, null);
        api.sendCookie(spent);
        api.post(REFRESH_PATH, Map.of());
    }

    @When("the sessions are cleaned up")
    public void theSessionsAreCleanedUp() {
        cleanup.cleanUp();
    }

    @When("the {string} asks the status of its sign-in")
    public void theDeviceAsksTheStatusOfItsSignIn(String device) {
        String secret = sessionOf(device).deviceSecret();
        assertThat(secret).withFailMessage("The %s holds no device secret", device).isNotNull();
        aDeviceAsksTheStatusWithTheSecret(secret);
    }

    @When("the {string} asked the status of its sign-in {int} times")
    public void theDeviceAskedTheStatusOfItsSignInTimes(String device, int times) {
        for (int question = 0; question < times; question++) {
            theDeviceAsksTheStatusOfItsSignIn(device);
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Question %s answered %s", question + 1, api.lastResponse().getBody())
                    .isEqualTo(200);
        }
    }

    @When("a device asks the status with a secret no device holds")
    public void aDeviceAsksTheStatusWithASecretNoDeviceHolds() {
        aDeviceAsksTheStatusWithTheSecret(SECRET_NO_DEVICE_HOLDS);
    }

    @When("a device asks the status with the secret {string}")
    public void aDeviceAsksTheStatusWithTheSecret(String secret) {
        api.forgetCredentials();
        api.post(STATUS_PATH, Map.of("deviceSecret", secret));
    }

    @When("a device asks the status without a secret")
    public void aDeviceAsksTheStatusWithoutASecret() {
        api.forgetCredentials();
        api.post(STATUS_PATH, Map.of());
    }

    @Then("the device status is {string} for an account that is an administrator")
    public void theDeviceStatusIsForAnAdministrator(String status) {
        assertStatus(status, true);
    }

    @Then("the device status is {string} for an account that is not an administrator")
    public void theDeviceStatusIsForAnAccountThatIsNotAnAdministrator(String status) {
        assertStatus(status, false);
    }

    @Then("the {string} and the {string} hold different device secrets")
    public void theDevicesHoldDifferentDeviceSecrets(String first, String second) {
        assertThat(sessionOf(first).deviceSecret()).matches("[A-Za-z0-9_-]{43}");
        assertThat(sessionOf(second).deviceSecret()).matches("[A-Za-z0-9_-]{43}").isNotEqualTo(sessionOf(first).deviceSecret());
    }

    @Then("the answer carries no device secret")
    public void theAnswerCarriesNoDeviceSecret() {
        assertThat(api.lastResponseJson().has("deviceSecret")).isFalse();
    }

    @Then("the erased donor's devices keep only their ids, their secret's hash and the order to delete")
    public void theErasedDonorsDevicesKeepOnlyTheirIdsTheirSecretsHashAndTheOrderToDelete() {
        List<Map<String, Object>> rows = jdbc.sql("select platform, browser, session_kind, signed_in_at = ended_at and last_used_at = ended_at as one_time,"
                        + " end_reason, wipe, status_secret_hash is not null as hashed from donor_device where donor_id = ?")
                .param(donors.idOf("Jana")).query().listOfRows();
        Map<String, Object> reduced = new HashMap<>(Map.of("platform", "OTHER", "browser", "OTHER", "one_time", true, "end_reason", "ERASED",
                "wipe", "ALL", "hashed", true));
        reduced.put("session_kind", null);
        assertThat(rows).hasSizeGreaterThanOrEqualTo(2).allSatisfy(row -> assertThat(row).containsExactlyInAnyOrderEntriesOf(reduced));
    }

    @When("{string} lists the devices on the {string}")
    public void listsTheDevicesOnThe(String alias, String device) {
        onDevice(device, sessionOf(device).accessToken());
        api.get(DEVICES_PATH);
    }

    @When("{string} reads the profile on the {string}")
    public void readsTheProfileOnThe(String alias, String device) {
        onDevice(device, sessionOf(device).accessToken());
        api.get(PROFILE_PATH);
    }

    @When("{string} signs out the {string} on the {string}")
    public void signsOutTheDeviceOnThe(String alias, String signedOut, String device) {
        UUID id = idOf(device, signedOut);
        onDevice(device, sessionOf(device).accessToken());
        api.delete(DEVICES_PATH + "/" + id);
    }

    @When("{string} signs out every other device on the {string}")
    public void signsOutEveryOtherDeviceOnThe(String alias, String device) {
        onDevice(device, sessionOf(device).accessToken());
        api.delete(DEVICES_PATH);
    }

    @When("{string} signs out of the {string}")
    public void signsOutOfThe(String alias, String device) {
        onDevice(device, sessionOf(device).accessToken());
        api.sendCookie(sessionOf(device).refreshCookie());
        api.post(LOGOUT_PATH, Map.of());
    }

    @When("the {string} refreshes its session")
    public void theDeviceRefreshesItsSession(String device) {
        onDevice(device, null);
        api.sendCookie(sessionOf(device).refreshCookie());
        api.post(REFRESH_PATH, Map.of());
        if (api.lastResponse().getStatusCode().value() == 200) {
            remember(device, api.lastResponse());
        }
    }

    @When("{string} changes the password to {string} on the {string}")
    public void changesThePasswordOnThe(String alias, String password, String device) {
        onDevice(device, sessionOf(device).accessToken());
        api.put(PASSWORD_PATH, Map.of("currentPassword", donors.credentialsOf(alias).password(), "newPassword", password));
        if (api.lastResponse().getStatusCode().value() == 200) {
            donors.rememberCredentials(alias, donors.credentialsOf(alias).email(), password);
            remember(device, api.lastResponse());
        }
    }

    @When("{string} tries to sign out the {string} of {string}")
    public void triesToSignOutTheDeviceOf(String alias, String device, String owner) {
        UUID id = idOf(device, device);
        donorsSession(alias);
        api.delete(DEVICES_PATH + "/" + id);
    }

    @When("someone without a token lists the devices")
    public void someoneWithoutATokenListsTheDevices() {
        api.forgetCredentials();
        api.get(DEVICES_PATH);
    }

    @When("someone without a token signs out every other device")
    public void someoneWithoutATokenSignsOutEveryOtherDevice() {
        api.forgetCredentials();
        api.delete(DEVICES_PATH);
    }

    @When("someone without a token signs out a device")
    public void someoneWithoutATokenSignsOutADevice() {
        api.forgetCredentials();
        api.delete(DEVICES_PATH + "/" + UNKNOWN_DEVICE);
    }

    @Then("the devices are:")
    public void theDevicesAre(DataTable expected) {
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Listing the devices answered %s", api.lastResponse().getBody())
                .isEqualTo(200);
        List<Map<String, String>> listed = new ArrayList<>();
        for (JsonNode item : api.lastResponseJson().get("items")) {
            listed.add(Map.of("platform", item.get("platform").asString(), "browser", item.get("browser").asString(),
                    "current", String.valueOf(item.get("current").asBoolean())));
        }
        assertThat(listed).isEqualTo(expected.asMaps());
    }

    @Then("each device names when it signed in and when it was last used")
    public void eachDeviceNamesWhenItSignedInAndWhenItWasLastUsed() {
        for (JsonNode item : api.lastResponseJson().get("items")) {
            assertThat(item.get("signedInAt").asString()).isNotBlank();
            assertThat(item.get("lastUsedAt").asString()).isNotBlank();
            assertThat(item.get("lastUsedAt").asString().compareTo(item.get("signedInAt").asString())).isNotNegative();
        }
    }

    private UUID idOf(String listingDevice, String wanted) {
        String platform = new DeviceName(wanted).platform();
        onDevice(listingDevice, sessionOf(listingDevice).accessToken());
        api.get(DEVICES_PATH);
        for (JsonNode item : api.lastResponseJson().get("items")) {
            if (item.get("platform").asString().equals(platform)) {
                return UUID.fromString(item.get("id").asString());
            }
        }
        throw new AssertionError("The " + wanted + " is not among the devices listed on the " + listingDevice);
    }

    private void donorsSession(String alias) {
        api.forgetCredentials();
        api.authorize(donors.accessTokenOf(alias));
    }

    private void onDevice(String device, String accessToken) {
        api.forgetCredentials();
        api.sendHeader(HttpHeaders.USER_AGENT, new DeviceName(device).userAgent());
        if (accessToken != null) {
            api.authorize(accessToken);
        }
    }

    private void assertStatus(String status, boolean administrator) {
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The status answered %s", api.lastResponse().getBody()).isEqualTo(200);
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.propertyNames()).containsExactlyInAnyOrder("status", "administrator");
        assertThat(answer.get("status").asString()).isEqualTo(status);
        assertThat(answer.get("administrator").asBoolean()).isEqualTo(administrator);
    }

    private void remember(String device, ResponseEntity<String> response) {
        String setCookie = response.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).withFailMessage("The %s got no refresh cookie", device).isNotNull();
        JsonNode answer = api.lastResponseJson();
        Session previous = sessions.get(device);
        String deviceSecret = answer.has("deviceSecret") ? answer.get("deviceSecret").asString() : previous == null ? null : previous.deviceSecret();
        sessions.put(device, new Session(answer.get("accessToken").asString(), setCookie.split(";", 2)[0], deviceSecret,
                previous == null ? null : previous.refreshCookie()));
    }

    private Session sessionOf(String device) {
        Session session = sessions.get(device);
        assertThat(session).withFailMessage("Nobody signed in on the %s in this scenario", device).isNotNull();
        return session;
    }

    private record Session(String accessToken, String refreshCookie, String deviceSecret, String spentRefreshCookie) {
    }

    private record DeviceName(String name) {

        DeviceName {
            assertThat(USER_AGENTS).withFailMessage("No User-Agent is known for the device %s", name).containsKey(name);
        }

        String userAgent() {
            return USER_AGENTS.get(name);
        }

        String platform() {
            return switch (name) {
                case "iPhone" -> "IPHONE";
                case "Mac" -> "MAC";
                case "iPad" -> "IPAD";
                case "Android" -> "ANDROID";
                default -> "WINDOWS";
            };
        }
    }
}
