package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.operations.application.backup.BackupKeySource;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
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

import java.util.ArrayList;
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
    private final BackupKeySource backupKeys;

    public SettingsStepDefinitions(ApiClient api, DonorSessions sessions, RecordingSetupCodeAnnouncer announcer,
                                   RecordingApplicationRestarter restarter, JdbcClient jdbc, ScenarioDonors donors, BackupKeySource backupKeys) {
        this.api = api;
        this.sessions = sessions;
        this.announcer = announcer;
        this.restarter = restarter;
        this.jdbc = jdbc;
        this.donors = donors;
        this.backupKeys = backupKeys;
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
        api.post(SETUP, Map.of("settings", values(settings), "backupKeyWords", backupKeyWords()));
    }

    @When("the first setup is completed with wrong backup key words and:")
    public void theFirstSetupIsCompletedWithWrongBackupKeyWords(DataTable settings) {
        List<String> words = serverKey().words();
        api.post(SETUP, Map.of("settings", values(settings), "backupKeyWords",
                List.of(word(1, words.get(1)), word(2, words.get(2)), word(3, words.get(0)))));
    }

    @When("the first setup is completed with the backup key as {string} and:")
    public void theFirstSetupIsCompletedWithTheBackupKeyAs(String name, DataTable settings) {
        List<Map<String, String>> withKey = new ArrayList<>(values(settings));
        withKey.add(Map.of("name", name, "value", serverKey().value()));
        api.post(SETUP, Map.of("settings", withKey, "backupKeyWords", backupKeyWords()));
    }

    @When("the first setup is completed with the code from the container log and:")
    public void theFirstSetupIsCompletedWithTheCodeAnd(DataTable settings) {
        api.post(SETUP, Map.of("code", announcer.announced().value(), "settings", values(settings), "backupKeyWords", backupKeyWords()));
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
                List.of("ADMIN_EMAILS", "spravce@example.cz"))), "backupKeyWords", backupKeyWords()));
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The setup answered %s", api.lastResponse().getBody()).isEqualTo(202);
        restarter.reset();
    }

    @When("a test e-mail is sent in the setup through {string} with the password {string} from {string} to {string}")
    public void aTestEmailIsSentInTheSetup(String host, String password, String sender, String recipient) {
        api.post(SETUP + "/test-email", testEmail(host, password, sender, Map.of("recipient", recipient)));
    }

    @When("a test e-mail is sent in the setup with the code from the container log through {string} from {string} to {string}")
    public void aTestEmailIsSentInTheSetupWithTheCode(String host, String sender, String recipient) {
        api.post(SETUP + "/test-email", testEmail(host, FakeMailServerProbe.PASSWORD, sender,
                Map.of("recipient", recipient, "code", announcer.announced().value())));
    }

    @Given("{int} test e-mails were sent in the setup from this address")
    public void testEmailsWereSentInTheSetupFromThisAddress(int count) {
        for (int i = 0; i < count; i++) {
            aTestEmailIsSentInTheSetup(FakeMailServerProbe.HOST, FakeMailServerProbe.PASSWORD, "info@nfnn.cz", "spravce@example.cz");
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        }
    }

    @When("{string} sends a test e-mail through {string} with the password {string} from {string}")
    public void sendsATestEmail(String alias, String host, String password, String sender) {
        sessions.actAs(alias);
        api.post(SETTINGS + "/test-email", testEmail(host, password, sender, Map.of()));
    }

    @When("{string} sent {int} test e-mails")
    public void sentTestEmails(String alias, int count) {
        for (int i = 0; i < count; i++) {
            sendsATestEmail(alias, FakeMailServerProbe.HOST, FakeMailServerProbe.PASSWORD, "info@nfnn.cz");
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        }
    }

    @When("someone without a token sends a test e-mail through {string}")
    public void someoneWithoutATokenSendsATestEmail(String host) {
        api.forgetCredentials();
        api.post(SETTINGS + "/test-email", testEmail(host, FakeMailServerProbe.PASSWORD, "info@nfnn.cz", Map.of()));
    }

    @Then("the test e-mail says {string} to {string}")
    public void theTestEmailSays(String outcome, String recipient) {
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The test e-mail answered %s", api.lastResponse().getBody()).isEqualTo(200);
        JsonNode result = api.lastResponseJson();
        assertThat(result.get("outcome").asString()).isEqualTo(outcome);
        assertThat(result.get("sent").asBoolean()).isEqualTo(outcome.equals("SENT"));
        assertThat(result.get("recipient").asString()).isEqualTo(recipient);
    }

    @Then("the test e-mail says {string} to the e-mail of {string}")
    public void theTestEmailSaysToTheEmailOf(String outcome, String alias) {
        theTestEmailSays(outcome, donors.credentialsOf(alias).email());
    }

    static Map<String, Object> testEmail(String host, String password, String sender, Map<String, String> extra) {
        Map<String, Object> body = new HashMap<>(Map.of("host", host, "port", 587, "username", "user", "password", password, "auth", true,
                "startTls", true, "sender", sender));
        body.putAll(extra);
        return body;
    }

    @When("{int} setup requests were made from this address")
    public void setupRequestsWereMadeFromThisAddress(int count) {
        for (int i = 0; i < count; i++) {
            theSetupIsUnlockedWithTheCode("WRONG-CODE-0000");
        }
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

    @When("{string} changes the settings in {string}:")
    public void changesTheSettingsIn(String alias, String language, DataTable changes) {
        sessions.actAs(alias);
        api.acceptLanguage(language);
        api.put(SETTINGS, Map.of("changes", values(changes)));
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

    private List<Map<String, Object>> backupKeyWords() {
        List<String> words = serverKey().words();
        return List.of(word(4, words.get(3)), word(11, words.get(10).substring(0, 4)), word(24, words.get(23).toUpperCase()));
    }

    private static Map<String, Object> word(int position, String word) {
        return Map.of("position", position, "word", word);
    }

    private BackupKey serverKey() {
        return backupKeys.current().orElseThrow(() -> new AssertionError("The test backend has no backup key"));
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
