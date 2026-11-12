package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ConcurrentWrites;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

public class StaleSettingsStepDefinitions {

    private static final String SETTINGS = "/api/admin/operations/settings";
    private static final Pattern SETS = Pattern.compile("sets ([A-Z_]+) to (.+)");
    private static final String ADVISORY_LOCK = "select pg_advisory_xact_lock(?)";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final SettingsRowVersions versions;
    private final ConcurrentWrites concurrentWrites;
    private final JdbcClient jdbc;
    private final Map<String, String> readVersions = new HashMap<>();

    public StaleSettingsStepDefinitions(ApiClient api, DonorSessions sessions, SettingsRowVersions versions, ConcurrentWrites concurrentWrites, JdbcClient jdbc) {
        this.api = api;
        this.sessions = sessions;
        this.versions = versions;
        this.concurrentWrites = concurrentWrites;
        this.jdbc = jdbc;
    }

    @When("these settings changes start one after another from the versions read before them, while the settings lock is held:")
    public void theseSettingsChangesStartWhileTheSettingsLockIsHeld(DataTable table) {
        List<ConcurrentWrites.Write> writes = table.asMaps().stream().map(row -> write(row.get("who"), row.get("write"))).toList();
        concurrentWrites.sendWhileHeld(ADVISORY_LOCK, AdvisoryLock.SETTINGS_CHANGES.key(), writes);
    }

    @When("{string} opens the settings")
    public void opensTheSettings(String alias) {
        sessions.actAs(alias);
        api.get(SETTINGS);
        readVersions.put(alias, api.lastResponseJson().get("version").asString());
    }

    @When("someone without a token sets {word} to {string} from the version stored now")
    public void someoneWithoutATokenSets(String name, String value) {
        Map<String, String> ifMatch = versions.ifMatchOfStored();
        api.forgetCredentials();
        api.put(SETTINGS, change(name, value), ifMatch);
    }

    @When("{string} sets {word} to {string} from the version read before")
    public void setsFromTheVersionReadBefore(String alias, String name, String value) {
        sessions.actAs(alias);
        api.put(SETTINGS, change(name, value), ApiClient.ifMatch(readVersions.get(alias)));
    }

    @When("{string} sets {word} to {string} from the version stored now")
    public void setsFromTheVersionStoredNow(String alias, String name, String value) {
        sessions.actAs(alias);
        api.put(SETTINGS, change(name, value), versions.ifMatchOfStored());
    }

    @When("{string} sets {word} to {string} from the version in the refusal")
    public void setsFromTheVersionInTheRefusal(String alias, String name, String value) {
        String version = api.lastResponseJson().get("version").asString();
        sessions.actAs(alias);
        api.put(SETTINGS, change(name, value), ApiClient.ifMatch(version));
    }

    @When("{string} sets {word} to {string} naming no version")
    public void setsNamingNoVersion(String alias, String name, String value) {
        sessions.actAs(alias);
        api.put(SETTINGS, change(name, value));
    }

    @Then("the refusal names the settings version now stored and the stored {word} {string}")
    public void theRefusalNamesTheSettingsVersionNowStored(String name, String value) {
        JsonNode refusal = api.lastResponseJson();
        assertThat(refusal.get("version").asString()).isEqualTo(versions.ofStored());
        JsonNode row = refusal.get("current").get("settings").valueStream()
                .filter(stored -> stored.get("name").asString().equals(name)).findFirst()
                .orElseThrow(() -> new AssertionError("The refusal names no stored " + name + ": " + refusal));
        assertThat(row.get("value").asString()).isEqualTo(value);
    }

    @Then("no setting {word} is stored")
    public void noSettingIsStored(String name) {
        assertThat(jdbc.sql("select count(*) from operations_setting where name = ?").param(name).query(Long.class).single()).isZero();
    }

    @Then("the refusal names no stored ADMIN_EMAILS")
    public void theRefusalNamesNoStoredAdminEmails() {
        assertThat(api.lastResponseJson().get("current").get("settings").valueStream().map(row -> row.get("name").asString())).doesNotContain("ADMIN_EMAILS");
    }

    @Then("the answer names the settings version now stored")
    public void theAnswerNamesTheSettingsVersionNowStored() {
        assertThat(api.lastResponseJson().get("version").asString()).isEqualTo(versions.ofStored());
    }

    private ConcurrentWrites.Write write(String alias, String phrase) {
        Matcher matched = SETS.matcher(phrase);
        if (!matched.matches()) {
            throw new IllegalArgumentException("No such settings change: " + phrase);
        }
        String read = versions.ofStored();
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(HttpHeaders.AUTHORIZATION, sessions.bearerOf(alias));
        headers.putAll(ApiClient.ifMatch(read));
        return new ConcurrentWrites.Write(new ApiClient.PreparedRequest(HttpMethod.PUT, SETTINGS, change(matched.group(1), matched.group(2)), headers),
                read, versions::ofStored);
    }

    private static Map<String, Object> change(String name, String value) {
        return Map.of("changes", List.of(Map.of("name", name, "value", value)));
    }
}
