package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.operations.application.backup.BackupRestoreService;
import cz.novanadeje.app.operations.infrastructure.backup.BackupProperties;
import cz.novanadeje.app.support.RecordingSetupCodeAnnouncer;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

public class RestoreStepDefinitions {

    private static final String BACKUPS = "/api/admin/operations/backups";
    private static final String SETUP_RESTORE = "/api/operations/setup/restore";
    private static final String CODE_HEADER = "X-Nfnn-Setup-Code";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final RecordingSetupCodeAnnouncer announcer;
    private final BackupRestoreService restores;
    private final Path requests;
    private final Path status;
    private final Path restore;
    private byte[] uploaded;

    public RestoreStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, RecordingSetupCodeAnnouncer announcer,
                                  BackupRestoreService restores, BackupProperties properties) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
        this.announcer = announcer;
        this.restores = restores;
        this.requests = properties.directory().resolve("requests");
        this.status = properties.directory().resolve("status");
        this.restore = properties.restoreDirectory();
    }

    @When("{string} restores the backup {string}")
    public void restoresTheBackup(String alias, String fileName) {
        sessions.actAs(alias);
        api.post(BACKUPS + "/" + fileName + "/restore", Map.of());
    }

    @When("someone without a token restores the backup {string}")
    public void someoneWithoutATokenRestoresTheBackup(String fileName) {
        api.forgetCredentials();
        api.post(BACKUPS + "/" + fileName + "/restore", Map.of());
    }

    @When("a backup of {int} bytes is uploaded in the first setup")
    public void aBackupIsUploadedInTheFirstSetup(int size) {
        uploaded = dump(size);
        api.putBytes(SETUP_RESTORE, uploaded, Map.of());
    }

    @When("a backup of {int} bytes is uploaded in the first setup with the code from the container log")
    public void aBackupIsUploadedWithTheCode(int size) {
        uploaded = dump(size);
        api.putBytes(SETUP_RESTORE, uploaded, Map.of(CODE_HEADER, announcer.announced().display()));
    }

    @When("the file {string} is uploaded in the first setup")
    public void theFileIsUploadedInTheFirstSetup(String fileName) {
        uploaded = ("ÿØÿà " + fileName).getBytes(StandardCharsets.ISO_8859_1);
        api.putBytes(SETUP_RESTORE, uploaded, Map.of());
    }

    @Given("the backup container restored {string} for {string} under the request {string}")
    public void theBackupContainerRestored(String fileName, String alias, String requestId) {
        writeRestoreStatus("outcome=ok\nstarted_at=2026-10-23T08:00:00Z\nfinished_at=2026-10-23T08:00:05Z\nfile=" + fileName + "\nsize=1000\ntables=37\nrequest="
                + requestId + "\nadmin=" + donors.idOf(alias) + "\n");
    }

    @Given("the backup container failed to restore {string} for {string} under the request {string} with {string}")
    public void theBackupContainerFailedToRestore(String fileName, String alias, String requestId, String error) {
        String admin = "nobody".equals(alias) ? "" : donors.idOf(alias).toString();
        writeRestoreStatus("outcome=failed\nstarted_at=2026-10-23T08:00:00Z\nfinished_at=2026-10-23T08:00:05Z\nfile=" + fileName + "\nrequest=" + requestId
                + "\nadmin=" + admin + "\nerror=" + error + "\n");
    }

    @When("the backend has started")
    public void theBackendHasStarted() {
        restores.recordFinishedRestore();
    }

    @Then("a restore request of the backup {string} by {string} waits for the backup container")
    public void aRestoreRequestWaits(String fileName, String alias) {
        Path request = requests.resolve(api.lastResponseJson().get("requestId").asString() + ".restore");
        assertThat(request).hasContent("source=backup\nfile=" + fileName + "\nadmin=" + donors.idOf(alias) + "\n");
    }

    @Then("no restore request waits for the backup container")
    public void noRestoreRequestWaits() {
        assertThat(files(requests)).noneMatch(name -> name.endsWith(".restore"));
    }

    @Then("the uploaded backup waits in the restore folder with a restore request")
    public void theUploadedBackupWaits() {
        String requestId = api.lastResponseJson().get("requestId").asString();
        assertThat(restore.resolve(requestId + ".upload")).hasBinaryContent(uploaded);
        assertThat(requests.resolve(requestId + ".restore")).hasContent("source=upload\nfile=" + requestId + ".upload\nadmin=\n");
    }

    @Then("the restore folder holds no upload")
    public void theRestoreFolderHoldsNoUpload() {
        assertThat(files(restore)).noneMatch(name -> name.contains(".upload"));
    }

    @Then("the setup status names the restore {string} as {string} with {string}")
    public void theSetupStatusNamesTheRestore(String requestId, String outcome, String error) {
        JsonNode lastRestore = api.lastResponseJson().get("lastRestore");
        assertThat(lastRestore.get("requestId").asString()).isEqualTo(requestId);
        assertThat(lastRestore.get("outcome").asString()).isEqualTo(outcome);
        assertThat(lastRestore.get("error").asString()).isEqualTo(error);
    }

    @Then("the setup status names no restore")
    public void theSetupStatusNamesNoRestore() {
        assertThat(api.lastResponseJson().get("lastRestore").isNull()).isTrue();
    }

    private void writeRestoreStatus(String content) {
        try {
            Files.createDirectories(status);
            Files.writeString(status.resolve("restore"), content);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static byte[] dump(int size) {
        byte[] bytes = new byte[size];
        byte[] magic = "PGDMP".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(magic, 0, bytes, 0, magic.length);
        return bytes;
    }

    private static Stream<String> files(Path folder) {
        if (!Files.isDirectory(folder)) {
            return Stream.empty();
        }
        try (Stream<Path> entries = Files.list(folder)) {
            return entries.map(path -> path.getFileName().toString()).toList().stream();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
