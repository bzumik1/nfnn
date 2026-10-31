package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.operations.application.backup.BackupWatchService;
import cz.novanadeje.app.operations.infrastructure.backup.BackupProperties;
import cz.novanadeje.app.support.AsyncTaskTracker;
import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

public class BackupStepDefinitions {

    private static final String BACKUPS = "/api/admin/operations/backups";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final BackupWatchService watch;
    private final AsyncTaskTracker asyncTasks;
    private final Path backups;
    private final Path restore;

    public BackupStepDefinitions(ApiClient api, DonorSessions sessions, BackupWatchService watch, BackupProperties properties,
                                 AsyncTaskTracker asyncTasks) {
        this.api = api;
        this.sessions = sessions;
        this.watch = watch;
        this.asyncTasks = asyncTasks;
        this.backups = properties.directory();
        this.restore = properties.restoreDirectory();
    }

    @Before
    public void emptyFolders() {
        deleteRecursively(backups);
        deleteRecursively(restore);
    }

    @Given("the backup folder exists")
    public void theBackupFolderExists() {
        createDirectories(backups.resolve("status"));
        createDirectories(backups.resolve("requests"));
        createDirectories(restore);
    }

    @Given("the backup folder does not exist")
    public void theBackupFolderDoesNotExist() {
        deleteRecursively(backups);
    }

    @Given("these backups are in the backup folder:")
    public void theseBackupsAreInTheBackupFolder(List<Map<String, String>> rows) {
        for (Map<String, String> row : rows) {
            Path file = backups.resolve(row.get("file"));
            try {
                Files.write(file, new byte[Integer.parseInt(row.get("size"))]);
                Files.setLastModifiedTime(file, FileTime.from(Instant.parse(row.get("createdAt"))));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }

    @Given("the backup status says:")
    public void theBackupStatusSays(Map<String, String> lines) {
        writeStatus("backup", lines);
    }

    @Given("the test restore status says:")
    public void theTestRestoreStatusSays(Map<String, String> lines) {
        writeStatus("test-restore", lines);
    }

    @Given("the restore folder holds {string}")
    public void theRestoreFolderHolds(String fileName) {
        createDirectories(restore);
        try {
            Files.write(restore.resolve(fileName), new byte[10]);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @When("{string} asks for the backups")
    public void asksForTheBackups(String alias) {
        sessions.actAs(alias);
        api.get(BACKUPS);
    }

    @When("someone without a token asks for the backups")
    public void someoneWithoutATokenAsksForTheBackups() {
        api.forgetCredentials();
        api.get(BACKUPS);
    }

    @When("{string} asks for a backup now")
    public void asksForABackupNow(String alias) {
        sessions.actAs(alias);
        api.post(BACKUPS + "/requests", Map.of("kind", "BACKUP"));
    }

    @When("{string} asks for a test restore now")
    public void asksForATestRestoreNow(String alias) {
        sessions.actAs(alias);
        api.post(BACKUPS + "/requests", Map.of("kind", "TEST_RESTORE"));
    }

    @When("{string} downloads the backup {string}")
    public void downloadsTheBackup(String alias, String fileName) {
        sessions.actAs(alias);
        api.getBytes(BACKUPS + "/" + fileName);
    }

    @When("the backup check runs")
    public void theBackupCheckRuns() {
        watch.check();
        asyncTasks.awaitIdleAfter("the backup check");
    }

    @Then("the backups answer says:")
    public void theBackupsAnswerSays(Map<String, String> expected) {
        JsonNode response = api.lastResponseJson();
        expected.forEach((path, value) -> assertThat(at(response, path).asString()).as(path).isEqualTo(value));
    }

    @Then("the backups answer lists no problem")
    public void theBackupsAnswerListsNoProblem() {
        assertThat(api.lastResponseJson().get("problems")).isEmpty();
    }

    @Then("the backups answer lists the problems {string}")
    public void theBackupsAnswerListsTheProblems(String problems) {
        List<String> listed = api.lastResponseJson().get("problems").valueStream().map(JsonNode::asString).toList();
        assertThat(listed).containsExactly(Arrays.stream(problems.split(",")).map(String::trim).toArray(String[]::new));
    }

    @Then("a request file for the backup waits for the backup container")
    public void aRequestFileForTheBackupWaits() {
        assertThat(backups.resolve("requests").resolve(api.lastResponseJson().get("requestId").asString() + ".backup")).isEmptyFile();
    }

    @Then("a request file for the test restore waits for the backup container")
    public void aRequestFileForTheTestRestoreWaits() {
        assertThat(backups.resolve("requests").resolve(api.lastResponseJson().get("requestId").asString() + ".test-restore")).isEmptyFile();
    }

    @When("{string} plans the daily backup at {string} and the test restore on day {int} at {string}")
    public void plansTheBackups(String alias, String backupTime, int testRestoreDay, String testRestoreTime) {
        sessions.actAs(alias);
        api.put(BACKUPS + "/schedule", Map.of("backupTime", backupTime, "testRestoreDay", testRestoreDay, "testRestoreTime", testRestoreTime));
    }

    @When("someone without a token plans the daily backup at {string} and the test restore on day {int} at {string}")
    public void someoneWithoutATokenPlansTheBackups(String backupTime, int testRestoreDay, String testRestoreTime) {
        api.forgetCredentials();
        api.put(BACKUPS + "/schedule", Map.of("backupTime", backupTime, "testRestoreDay", testRestoreDay, "testRestoreTime", testRestoreTime));
    }

    @Given("the backup container reports the plan:")
    public void theBackupContainerReportsThePlan(Map<String, String> lines) {
        writeStatus("schedule", lines);
    }

    @Then("the plan file for the backup container says:")
    public void thePlanFileForTheBackupContainerSays(String content) {
        assertThat(backups.resolve("requests").resolve("schedule")).hasContent(content);
    }

    @Then("no plan file waits for the backup container")
    public void noPlanFileWaitsForTheBackupContainer() {
        assertThat(backups.resolve("requests").resolve("schedule")).doesNotExist();
    }

    @Then("the backups answer names no plan applied by the backup container")
    public void theBackupsAnswerNamesNoAppliedPlan() {
        assertThat(api.lastResponseJson().get("schedule").get("applied").isNull()).isTrue();
    }

    @Then("the downloaded backup is {int} bytes named {string}")
    public void theDownloadedBackupIsBytesNamed(int size, String fileName) {
        ResponseEntity<String> response = api.lastResponse();
        assertThat(api.lastResponseBytes()).hasSize(size);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION)).contains("attachment").contains(fileName);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo("private, no-store");
    }

    private void writeStatus(String name, Map<String, String> lines) {
        createDirectories(backups.resolve("status"));
        StringBuilder content = new StringBuilder();
        lines.forEach((key, value) -> content.append(key).append('=').append(value).append('\n'));
        try {
            Files.writeString(backups.resolve("status").resolve(name), content.toString());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
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
