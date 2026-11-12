package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.cucumber.TotpCodes;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
    private static final UUID UNKNOWN_DEVICE = UUID.fromString("019a5a00-0000-7000-8000-000000000001");
    private static final Map<String, String> USER_AGENTS = Map.of(
            "iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1",
            "Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0",
            "Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0");

    private final ApiClient api;
    private final ScenarioDonors donors;
    private final TotpCodes totpCodes;
    private final Map<String, Session> sessions = new HashMap<>();

    public DonorDevicesStepDefinitions(ApiClient api, ScenarioDonors donors, TotpCodes totpCodes) {
        this.api = api;
        this.donors = donors;
        this.totpCodes = totpCodes;
    }

    @Given("{string} signs in on the {string}")
    public void signsInOnThe(String alias, String device) {
        ScenarioDonors.Credentials credentials = donors.credentialsOf(alias);
        signIn(alias, device, Map.of("email", credentials.email(), "password", credentials.password()));
    }

    @Given("{string} signs in on the {string} with the session {string}")
    public void signsInOnTheWithTheSession(String alias, String device, String session) {
        ScenarioDonors.Credentials credentials = donors.credentialsOf(alias);
        signIn(alias, device, Map.of("email", credentials.email(), "password", credentials.password(), "session", session));
    }

    private void signIn(String alias, String device, Map<String, String> body) {
        onDevice(device, null);
        ResponseEntity<String> response = api.post(LOGIN_PATH, body);
        if (response.getStatusCode().value() == 401 && api.lastResponseJson().get("type").asString().endsWith("auth/second-factor-required")) {
            String challenge = api.lastResponseJson().get("challenge").asString();
            Map<String, String> secondFactor = new HashMap<>(Map.of("challenge", challenge, "code", totpCodes.freshCode(donors.secondFactorSecretOf(alias))));
            if (body.containsKey("session")) {
                secondFactor.put("session", body.get("session"));
            }
            response = api.post(SECOND_FACTOR_PATH, secondFactor);
        }
        assertThat(response.getStatusCode().value()).withFailMessage("Signing in on the %s answered %s", device, response.getBody()).isEqualTo(200);
        remember(device, response);
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
        List<String> columns = expected.row(0);
        List<Map<String, String>> listed = new ArrayList<>();
        for (JsonNode item : api.lastResponseJson().get("items")) {
            Map<String, String> row = new LinkedHashMap<>();
            for (String column : columns) {
                row.put(column, item.path(column).asString(""));
            }
            listed.add(row);
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

    private void remember(String device, ResponseEntity<String> response) {
        String setCookie = response.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).withFailMessage("The %s got no refresh cookie", device).isNotNull();
        sessions.put(device, new Session(api.lastResponseJson().get("accessToken").asString(), setCookie.split(";", 2)[0]));
    }

    private Session sessionOf(String device) {
        Session session = sessions.get(device);
        assertThat(session).withFailMessage("Nobody signed in on the %s in this scenario", device).isNotNull();
        return session;
    }

    private record Session(String accessToken, String refreshCookie) {
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
                default -> "WINDOWS";
            };
        }
    }
}
