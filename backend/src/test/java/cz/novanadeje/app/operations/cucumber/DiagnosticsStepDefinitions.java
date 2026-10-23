package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.operations.infrastructure.logs.LogProperties;
import cz.novanadeje.app.support.RecordingResetTimer;
import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

public class DiagnosticsStepDefinitions {

    private static final String LOGS = "/api/admin/operations/logs";
    private static final String LOGGERS = "/api/admin/operations/loggers";
    private static final String DIAGNOSTICS = "/api/admin/operations/diagnostics";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final RecordingResetTimer timer;
    private final Path logs;

    public DiagnosticsStepDefinitions(ApiClient api, DonorSessions sessions, RecordingResetTimer timer, LogProperties properties) {
        this.api = api;
        this.sessions = sessions;
        this.timer = timer;
        this.logs = properties.directory();
    }

    @Before
    public void emptyFolder() {
        deleteRecursively(logs);
        timer.fireAll();
    }

    @Given("the log folder holds {string} with the lines:")
    public void theLogFolderHoldsWithTheLines(String name, String lines) {
        createDirectories(logs);
        try {
            Files.writeString(logs.resolve(name), lines + "\n");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Given("the log folder holds {string} compressed with the lines:")
    public void theLogFolderHoldsCompressedWithTheLines(String name, String lines) {
        createDirectories(logs);
        try (OutputStream out = new GZIPOutputStream(Files.newOutputStream(logs.resolve(name)))) {
            out.write((lines + "\n").getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Given("the log folder does not exist")
    public void theLogFolderDoesNotExist() {
        deleteRecursively(logs);
    }

    @When("{string} asks for the log files")
    public void asksForTheLogFiles(String alias) {
        sessions.actAs(alias);
        api.get(LOGS);
    }

    @When("{string} reads the log {string}")
    public void readsTheLog(String alias, String name) {
        sessions.actAs(alias);
        api.get(LOGS + "/" + name);
    }

    @When("{string} reads the log {string} from byte {int} for {int} bytes")
    public void readsTheLogFromByteForBytes(String alias, String name, int from, int bytes) {
        sessions.actAs(alias);
        api.get(LOGS + "/" + name + "?from=" + from + "&bytes=" + bytes);
    }

    @When("{string} searches the log {string} for {string}")
    public void searchesTheLogFor(String alias, String name, String pattern) {
        sessions.actAs(alias);
        api.get(LOGS + "/" + name + "/search?pattern=" + pattern);
    }

    @When("{string} searches the log {string} for {string} with at most {int} match(es)")
    public void searchesTheLogForWithAtMost(String alias, String name, String pattern, int limit) {
        sessions.actAs(alias);
        api.get(LOGS + "/" + name + "/search?pattern=" + pattern + "&limit=" + limit);
    }

    @When("{string} searches the log {string} for {string} before byte {int}")
    public void searchesTheLogForBeforeByte(String alias, String name, String pattern, int before) {
        sessions.actAs(alias);
        api.get(LOGS + "/" + name + "/search?pattern=" + pattern + "&before=" + before);
    }

    @When("{string} sets the logger {string} to {string} for {int} minutes")
    public void setsTheLoggerToForMinutes(String alias, String logger, String level, int minutes) {
        sessions.actAs(alias);
        api.put(LOGGERS + "/" + logger, Map.of("level", level, "minutes", minutes));
    }

    @When("{string} resets the logger {string}")
    public void resetsTheLogger(String alias, String logger) {
        sessions.actAs(alias);
        api.delete(LOGGERS + "/" + logger);
    }

    @When("{string} asks for the log levels")
    public void asksForTheLogLevels(String alias) {
        sessions.actAs(alias);
        api.get(LOGGERS);
    }

    @When("the temporary levels run out")
    public void theTemporaryLevelsRunOut() {
        timer.fireAll();
    }

    @When("{string} asks for the diagnostics")
    public void asksForTheDiagnostics(String alias) {
        sessions.actAs(alias);
        api.get(DIAGNOSTICS);
    }

    @When("someone without a token asks for the diagnostics")
    public void someoneWithoutATokenAsksForTheDiagnostics() {
        api.forgetCredentials();
        api.get(DIAGNOSTICS);
    }

    @When("{string} asks for the thread dump")
    public void asksForTheThreadDump(String alias) {
        sessions.actAs(alias);
        api.getBytes(DIAGNOSTICS + "/threads");
    }

    @Then("the logs answer says:")
    public void theLogsAnswerSays(Map<String, String> expected) {
        JsonNode response = api.lastResponseJson();
        expected.forEach((path, value) -> assertThat(at(response, path).asString()).as(path).isEqualTo(value));
    }

    @Then("the logs answer has no {string}")
    public void theLogsAnswerHasNo(String field) {
        assertThat(api.lastResponseJson().get(field).isNull()).as(field).isTrue();
    }

    @Then("the log text holds {string} and {string}")
    public void theLogTextHoldsAnd(String first, String second) {
        assertThat(api.lastResponseJson().get("text").asString()).contains(first).contains(second);
    }

    @Then("the log text holds {string} and not {string}")
    public void theLogTextHoldsAndNot(String present, String absent) {
        assertThat(api.lastResponseJson().get("text").asString()).contains(present).doesNotContain(absent);
    }

    @Then("the logger {string} is listed at {string} with a temporary level")
    public void theLoggerIsListedAtWithATemporaryLevel(String logger, String level) {
        api.get(LOGGERS);
        JsonNode entry = loggerEntry(logger);
        assertThat(entry.get("effectiveLevel").asString()).isEqualTo(level);
        assertThat(entry.get("override").isNull()).isFalse();
        assertThat(entry.get("override").get("level").asString()).isEqualTo(level);
    }

    @Then("the logger {string} is listed at {string} without a temporary level")
    public void theLoggerIsListedAtWithoutATemporaryLevel(String logger, String level) {
        api.get(LOGGERS);
        JsonNode entry = loggerEntry(logger);
        assertThat(entry.get("effectiveLevel").asString()).isEqualTo(level);
        assertThat(entry.get("override").isNull()).isTrue();
    }

    @Then("the diagnostics list the temporary level of {string}")
    public void theDiagnosticsListTheTemporaryLevelOf(String logger) {
        api.get(DIAGNOSTICS);
        assertThat(api.lastResponseJson().get("logLevelOverrides").valueStream().map(node -> node.get("logger").asString())).contains(logger);
    }

    @Then("the diagnostics say the database is reachable, the JVM has threads and the log folder is mounted")
    public void theDiagnosticsSayTheDatabaseIsReachable() {
        JsonNode response = api.lastResponseJson();
        assertThat(response.get("database").get("reachable").asBoolean()).isTrue();
        assertThat(response.get("database").get("maxConnections").asInt()).isPositive();
        assertThat(response.get("jvm").get("liveThreads").asInt()).isPositive();
        assertThat(response.get("jvm").get("heapMaxBytes").asLong()).isPositive();
        assertThat(response.get("disks").valueStream()
                .filter(disk -> disk.get("path").asString().endsWith("logs"))
                .map(disk -> disk.get("mounted").asBoolean()))
                .containsExactly(true);
    }

    @Then("the thread dump names a thread")
    public void theThreadDumpNamesAThread() {
        assertThat(api.lastResponse().getHeaders().getContentType().isCompatibleWith(MediaType.TEXT_PLAIN)).isTrue();
        assertThat(api.lastResponse().getBody()).contains("state=").contains("    at ");
    }

    private JsonNode loggerEntry(String logger) {
        return api.lastResponseJson().get("loggers").valueStream()
                .filter(node -> node.get("logger").asString().equals(logger))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no logger " + logger));
    }

    private static void createDirectories(Path directory) {
        try {
            Files.createDirectories(directory);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void deleteRecursively(Path directory) {
        if (!Files.exists(directory)) {
            return;
        }
        try (Stream<Path> entries = Files.walk(directory)) {
            for (Path entry : entries.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(entry);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static JsonNode at(JsonNode node, String path) {
        JsonNode current = node;
        for (String segment : path.split("\\.")) {
            current = segment.chars().allMatch(Character::isDigit) ? current.get(Integer.parseInt(segment)) : current.get(segment);
            assertThat(current).as(path).isNotNull();
        }
        return current;
    }
}
