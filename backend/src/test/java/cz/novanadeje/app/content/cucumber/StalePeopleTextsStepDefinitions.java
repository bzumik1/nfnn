package cz.novanadeje.app.content.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ConcurrentWrites;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.ParameterType;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

public class StalePeopleTextsStepDefinitions {

    private static final String PEOPLE = "/api/admin/content/people";
    private static final String FOUNDERS_NOTE = "founders note";
    private static final Pattern WRITE = Pattern.compile("writes the (founders note|line under the board) (.+)");
    private static final String ADVISORY_LOCK = "select pg_advisory_xact_lock(?)";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ContentRowVersions versions;
    private final ConcurrentWrites concurrentWrites;
    private final Map<String, String> readVersions = new HashMap<>();

    public StalePeopleTextsStepDefinitions(ApiClient api, DonorSessions sessions, ContentRowVersions versions, ConcurrentWrites concurrentWrites) {
        this.api = api;
        this.sessions = sessions;
        this.versions = versions;
        this.concurrentWrites = concurrentWrites;
    }

    @When("these writes start one after another from the versions read before them, while the people texts lock is held:")
    public void theseWritesStartWhileThePeopleTextsLockIsHeld(DataTable table) {
        List<ConcurrentWrites.Write> writes = table.asMaps().stream().map(row -> write(row.get("who"), row.get("write"))).toList();
        concurrentWrites.sendWhileHeld(ADVISORY_LOCK, AdvisoryLock.PEOPLE_TEXT_CHANGES.key(), writes);
    }

    @When("{string} reads the {peopleText}")
    public void readsThePeopleText(String alias, String text) {
        readVersions.put(alias + "/" + text, versionOf(text).get());
    }

    @When("{string} writes the {peopleText} {string} from the version stored now")
    public void writesThePeopleTextFromTheVersionStoredNow(String alias, String text, String value) {
        sessions.actAs(alias);
        api.put(pathOf(text), Map.of("text", value), ApiClient.ifMatch(versionOf(text).get()));
    }

    @When("{string} writes the {peopleText} {string} from the version read before")
    public void writesThePeopleTextFromTheVersionReadBefore(String alias, String text, String value) {
        sessions.actAs(alias);
        api.put(pathOf(text), Map.of("text", value), ApiClient.ifMatch(readVersions.get(alias + "/" + text)));
    }

    @When("{string} writes the {peopleText} {string} from the version in the refusal")
    public void writesThePeopleTextFromTheVersionInTheRefusal(String alias, String text, String value) {
        String version = api.lastResponseJson().get("version").asString();
        sessions.actAs(alias);
        api.put(pathOf(text), Map.of("text", value), ApiClient.ifMatch(version));
    }

    @When("{string} writes the {peopleText} {string} naming no version")
    public void writesThePeopleTextNamingNoVersion(String alias, String text, String value) {
        sessions.actAs(alias);
        api.put(pathOf(text), Map.of("text", value));
    }

    @When("someone without a token writes the {peopleText} {string} from the version stored now")
    public void someoneWithoutATokenWritesThePeopleText(String text, String value) {
        String version = versionOf(text).get();
        api.forgetCredentials();
        api.put(pathOf(text), Map.of("text", value), ApiClient.ifMatch(version));
    }

    @Then("the refusal names the version of the {peopleText} now stored and its text {string}")
    public void theRefusalNamesTheVersionNowStoredAndItsText(String text, String value) {
        assertThat(api.lastResponseJson().get("version").asString()).isEqualTo(versionOf(text).get());
        assertThat(api.lastResponseJson().get("current").get("text").asString()).isEqualTo(value);
    }

    @Then("the answer names the version of the {peopleText} now stored")
    public void theAnswerNamesTheVersionNowStored(String text) {
        assertThat(api.lastResponseJson().get("version").asString()).isEqualTo(versionOf(text).get());
    }

    @ParameterType("founders note|line under the board")
    public String peopleText(String text) {
        return text;
    }

    private ConcurrentWrites.Write write(String alias, String phrase) {
        Matcher matched = WRITE.matcher(phrase);
        if (!matched.matches()) {
            throw new IllegalArgumentException("No such people text write: " + phrase);
        }
        Supplier<String> versionNow = versionOf(matched.group(1));
        String read = versionNow.get();
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(HttpHeaders.AUTHORIZATION, sessions.bearerOf(alias));
        headers.putAll(ApiClient.ifMatch(read));
        return new ConcurrentWrites.Write(new ApiClient.PreparedRequest(HttpMethod.PUT, pathOf(matched.group(1)), Map.of("text", matched.group(2)), headers),
                read, versionNow);
    }

    private Supplier<String> versionOf(String text) {
        return FOUNDERS_NOTE.equals(text) ? versions::ofFoundersNote : versions::ofFootnote;
    }

    private static String pathOf(String text) {
        return PEOPLE + (FOUNDERS_NOTE.equals(text) ? "/note" : "/footnote");
    }
}
