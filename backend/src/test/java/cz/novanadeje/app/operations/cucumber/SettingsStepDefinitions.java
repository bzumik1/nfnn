package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.support.FakeMailServerProbe;
import cz.novanadeje.app.support.RecordingApplicationRestarter;
import cz.novanadeje.app.support.RecordingSetupCodeAnnouncer;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;

public class SettingsStepDefinitions {

    private static final String SETUP = "/api/operations/setup";
    private static final String SETTINGS = "/api/admin/operations/settings";
    private static final String DIRECT_HEADER = "X-Nfnn-Direct";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final RecordingSetupCodeAnnouncer announcer;
    private final RecordingApplicationRestarter restarter;
    private final JdbcClient jdbc;
    private final ScenarioDonors donors;

    public SettingsStepDefinitions(ApiClient api, DonorSessions sessions, RecordingSetupCodeAnnouncer announcer,
                                   RecordingApplicationRestarter restarter, JdbcClient jdbc, ScenarioDonors donors) {
        this.api = api;
        this.sessions = sessions;
        this.announcer = announcer;
        this.restarter = restarter;
        this.jdbc = jdbc;
        this.donors = donors;
    }

    @Before
    public void forgetRestarts() {
        restarter.reset();
    }

    @Given("the requests come directly from the home network")
    public void theRequestsComeDirectlyFromTheHomeNetwork() {
        api.sendHeader(DIRECT_HEADER, "1");
    }

    @Given("the requests come through the proxy")
    public void theRequestsComeThroughTheProxy() {
        api.sendHeader(DIRECT_HEADER, "0");
    }

    @Given("the requests come directly from a public address")
    public void theRequestsComeDirectlyFromAPublicAddress() {
        api.sendHeader(DIRECT_HEADER, "1");
        api.comeFromPublicAddress();
    }

    @When("the setup status is asked")
    public void theSetupStatusIsAsked() {
        api.get(SETUP);
    }

    @Then("the setup is required: {word}, with a code: {word}")
    public void theSetupIsRequiredWithACode(String required, String codeRequired) {
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The status answered %s", api.lastResponse().getBody()).isEqualTo(200);
        JsonNode status = api.lastResponseJson();
        assertThat(status.get("required").asBoolean()).isEqualTo(Boolean.parseBoolean(required));
        assertThat(status.get("codeRequired").asBoolean()).isEqualTo(Boolean.parseBoolean(codeRequired));
    }

    @When("the setup is unlocked with the code from the container log")
    public void theSetupIsUnlockedWithTheCodeFromTheContainerLog() {
        api.post(SETUP + "/unlock", Map.of("code", announcer.announced().display().toLowerCase()));
    }

    @When("the setup is unlocked with the code {string}")
    public void theSetupIsUnlockedWithTheCode(String code) {
        api.post(SETUP + "/unlock", Map.of("code", code));
    }

    @When("the setup is unlocked without a code")
    public void theSetupIsUnlockedWithoutACode() {
        api.post(SETUP + "/unlock", Map.of());
    }

    @When("the first setup is completed with:")
    public void theFirstSetupIsCompletedWith(DataTable settings) {
        api.post(SETUP, Map.of("settings", values(settings)));
    }

    @When("the first setup is completed with the code from the container log and:")
    public void theFirstSetupIsCompletedWithTheCodeAnd(DataTable settings) {
        api.post(SETUP, Map.of("code", announcer.announced().value(), "settings", values(settings)));
    }

    @Given("the first setup was completed")
    public void theFirstSetupWasCompleted() {
        theRequestsComeDirectlyFromTheHomeNetwork();
        api.post(SETUP, Map.of("settings", values(List.of(
                List.of("name", "value"),
                List.of("PUBLIC_URL", "https://nfnn.cz"),
                List.of("MAIL_HOST", "smtp-relay.brevo.com"),
                List.of("MAIL_PORT", "587"),
                List.of("MAIL_FROM", "info@nfnn.cz"),
                List.of("CONTACT_RECIPIENT", "info@nfnn.cz"),
                List.of("ADMIN_EMAILS", "spravce@example.cz")))));
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The setup answered %s", api.lastResponse().getBody()).isEqualTo(202);
        restarter.reset();
    }

    @When("the mail server {string} is tested in the setup with the password {string}")
    public void theMailServerIsTestedInTheSetup(String host, String password) {
        api.post(SETUP + "/mail-test", Map.of("host", host, "port", 587, "username", "user", "password", password, "auth", true, "startTls", true));
    }

    @When("{int} setup requests were made from this address")
    public void setupRequestsWereMadeFromThisAddress(int count) {
        for (int i = 0; i < count; i++) {
            theSetupIsUnlockedWithTheCode("WRONG-CODE-0000");
        }
    }

    @Then("the mail test says {word}")
    public void theMailTestSays(String outcome) {
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The mail test answered %s", api.lastResponse().getBody()).isEqualTo(200);
        assertThat(api.lastResponseJson().get("ok").asBoolean()).isEqualTo(Boolean.parseBoolean(outcome));
    }

    @Then("the backend restarts once")
    public void theBackendRestartsOnce() {
        assertThat(restarter.restarts()).isEqualTo(1);
    }

    @Then("the backend does not restart")
    public void theBackendDoesNotRestart() {
        assertThat(restarter.restarts()).isZero();
    }

    @Then("the stored settings are {string}")
    public void theStoredSettingsAre(String names) {
        List<String> stored = jdbc.sql("select name from operations_setting order by name").query(String.class).list();
        assertThat(stored).containsExactlyInAnyOrderElementsOf(names.isEmpty() ? List.of() : List.of(names.split(",\\s*")));
    }

    @Then("the stored {string} is sealed")
    public void theStoredIsSealed(String name) {
        Map<String, Object> row = jdbc.sql("select value, sealed from operations_setting where name = ?").param(name).query().singleRow();
        assertThat(row.get("sealed")).isEqualTo(true);
        assertThat((String) row.get("value")).startsWith("v1:");
    }

    @Then("the stored {string} is {string}")
    public void theStoredIs(String name, String value) {
        assertThat(jdbc.sql("select value from operations_setting where name = ?").param(name).query(String.class).single()).isEqualTo(value);
    }

    @Then("the problem names the settings {string}")
    public void theProblemNamesTheSettings(String names) {
        List<String> fields = StreamSupport.stream(api.lastResponseJson().get("errors").spliterator(), false)
                .map(error -> error.get("field").asString()).toList();
        assertThat(fields).containsExactlyInAnyOrder(names.split(",\\s*"));
        StreamSupport.stream(api.lastResponseJson().get("errors").spliterator(), false)
                .forEach(error -> assertThat(error.get("message").asString()).isNotBlank());
    }

    @When("{string} reads the settings")
    public void readsTheSettings(String alias) {
        sessions.actAs(alias);
        api.get(SETTINGS);
    }

    @When("someone without a token reads the settings")
    public void someoneWithoutATokenReadsTheSettings() {
        api.forgetCredentials();
        api.get(SETTINGS);
    }

    @When("{string} changes the settings:")
    public void changesTheSettings(String alias, DataTable changes) {
        sessions.actAs(alias);
        api.put(SETTINGS, Map.of("changes", values(changes)));
    }

    @When("{string} tests the mail server {string} without a password")
    public void testsTheMailServerWithoutAPassword(String alias, String host) {
        sessions.actAs(alias);
        api.post(SETTINGS + "/mail-test", Map.of("host", host, "port", 587, "username", "user", "auth", true, "startTls", true));
    }

    @Then("the setting {string} reads {string}")
    public void theSettingReads(String name, String expected) {
        JsonNode setting = setting(name);
        if (expected.equals("hidden, set")) {
            assertThat(setting.get("secret").asBoolean()).isTrue();
            assertThat(setting.get("value").isNull()).isTrue();
            assertThat(setting.get("configured").asBoolean()).isTrue();
        } else if (expected.equals("hidden, unset")) {
            assertThat(setting.get("value").isNull()).isTrue();
            assertThat(setting.get("configured").asBoolean()).isFalse();
        } else {
            assertThat(setting.get("value").asString()).isEqualTo(expected);
        }
    }

    @Then("the settings do not list {string}")
    public void theSettingsDoNotList(String name) {
        assertThat(StreamSupport.stream(api.lastResponseJson().get("settings").spliterator(), false).map(item -> item.get("name").asString()))
                .doesNotContain(name);
    }

    @Then("the administration history records {string} by {string}")
    public void theAdministrationHistoryRecords(String action, String alias) {
        String details = jdbc.sql("select details from admin_action where action = ? and admin_id = ?").param(action).param(donors.idOf(alias))
                .query(String.class).single();
        assertThat(details).doesNotContain(FakeMailServerProbe.PASSWORD);
    }

    private JsonNode setting(String name) {
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The settings answered %s", api.lastResponse().getBody()).isEqualTo(200);
        return StreamSupport.stream(api.lastResponseJson().get("settings").spliterator(), false)
                .filter(item -> item.get("name").asString().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No setting " + name + " in " + api.lastResponse().getBody()));
    }

    private static List<Map<String, String>> values(DataTable table) {
        return values(table.asLists());
    }

    private static List<Map<String, String>> values(List<List<String>> rows) {
        return rows.stream().skip(1).map(row -> {
            Map<String, String> value = new HashMap<>();
            value.put("name", row.get(0));
            value.put("value", row.get(1) == null ? "" : row.get(1));
            return value;
        }).toList();
    }
}
