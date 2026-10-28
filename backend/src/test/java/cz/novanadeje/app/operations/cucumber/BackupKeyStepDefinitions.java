package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.cucumber.TotpCodes;
import cz.novanadeje.app.donors.cucumber.DonorPasskeyStepDefinitions;
import cz.novanadeje.app.operations.application.backup.BackupKeySource;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.infrastructure.backup.BackupProperties;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class BackupKeyStepDefinitions {

    private static final String KEY = "/api/admin/operations/backups/key";
    private static final String SETUP_KEY = "/api/operations/setup/backup-key";
    private static final String SETUP_RESTORE = "/api/operations/setup/restore";
    private static final String BACKUP_KEY_HEADER = "X-Nfnn-Backup-Key";
    private static final byte[] ENCRYPTED_BACKUP = "age-encryption.org/v1\n-> X25519 encrypted dump".getBytes(StandardCharsets.US_ASCII);

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final TotpCodes totpCodes;
    private final DonorPasskeyStepDefinitions passkeys;
    private final BackupKeySource keys;
    private final Path restore;
    private String lastCode;

    public BackupKeyStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, TotpCodes totpCodes,
                                    DonorPasskeyStepDefinitions passkeys, BackupKeySource keys, BackupProperties properties) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
        this.totpCodes = totpCodes;
        this.passkeys = passkeys;
        this.keys = keys;
        this.restore = properties.restoreDirectory();
    }

    @When("{string} reveals the backup key without confirming it again")
    public void revealsTheBackupKeyWithoutConfirmingItAgain(String alias) {
        sessions.actAs(alias);
        api.post(KEY + "/reveal", Map.of());
    }

    @When("{string} reveals the backup key with the code {string}")
    public void revealsTheBackupKeyWithTheCode(String alias, String code) {
        sessions.actAs(alias);
        api.post(KEY + "/reveal", Map.of("secondFactorCode", code));
    }

    @When("{string} reveals the backup key with a fresh code")
    public void revealsTheBackupKeyWithAFreshCode(String alias) {
        lastCode = totpCodes.freshCode(donors.secondFactorSecretOf(alias));
        revealsTheBackupKeyWithTheCode(alias, lastCode);
    }

    @When("{string} reveals the backup key again with the same code")
    public void revealsTheBackupKeyAgainWithTheSameCode(String alias) {
        revealsTheBackupKeyWithTheCode(alias, lastCode);
    }

    @When("{string} reveals the backup key with the passkey {string}")
    public void revealsTheBackupKeyWithThePasskey(String alias, String name) {
        sessions.actAs(alias);
        Map<String, Object> answer = passkeys.passkeyConfirmation(alias, name);
        api.post(KEY + "/reveal", Map.of("passkey", answer));
    }

    @When("someone without a token reveals the backup key with the code {string}")
    public void someoneWithoutATokenRevealsTheBackupKey(String code) {
        api.forgetCredentials();
        api.post(KEY + "/reveal", Map.of("secondFactorCode", code));
    }

    @When("{string} confirms the backup key with the characters {string}")
    public void confirmsTheBackupKeyWithTheCharacters(String alias, String characters) {
        sessions.actAs(alias);
        api.post(KEY + "/confirmation", Map.of("check", characters));
    }

    @When("{string} confirms the backup key with its last four characters")
    public void confirmsTheBackupKeyWithItsLastFourCharacters(String alias) {
        confirmsTheBackupKeyWithTheCharacters(alias, serverKey().lastCharacters().toLowerCase());
    }

    @Given("{string} tried to confirm the backup key {int} times")
    public void triedToConfirmTheBackupKey(String alias, int times) {
        for (int i = 0; i < times; i++) {
            confirmsTheBackupKeyWithTheCharacters(alias, "AAAA");
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Confirming answered %s", api.lastResponse().getBody()).isEqualTo(400);
        }
    }

    @Then("the answer carries the backup key of this server and no cache keeps it")
    public void theAnswerCarriesTheBackupKey() {
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Revealing answered %s", api.lastResponse().getBody()).isEqualTo(200);
        assertThat(api.lastResponseJson().get("key").asString()).isEqualTo(serverKey().value());
        assertThat(api.lastResponse().getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo("private, no-store");
    }

    @Then("the answer carries no backup key")
    public void theAnswerCarriesNoBackupKey() {
        assertThat(api.lastResponse().getBody()).doesNotContain(serverKey().value());
    }

    @When("the backup key is asked for in the first setup")
    public void theBackupKeyIsAskedForInTheFirstSetup() {
        api.get(SETUP_KEY);
    }

    @When("an encrypted backup is uploaded in the first setup without its key")
    public void anEncryptedBackupIsUploadedWithoutItsKey() {
        api.putBytes(SETUP_RESTORE, ENCRYPTED_BACKUP, Map.of());
    }

    @When("an encrypted backup is uploaded in the first setup with the key {string}")
    public void anEncryptedBackupIsUploadedWithTheKey(String key) {
        api.putBytes(SETUP_RESTORE, ENCRYPTED_BACKUP, Map.of(BACKUP_KEY_HEADER, key));
    }

    @Then("the uploaded backup waits in the restore folder beside the key {string}")
    public void theUploadedBackupWaitsBesideTheKey(String key) {
        String requestId = api.lastResponseJson().get("requestId").asString();
        assertThat(restore.resolve(requestId + ".upload")).hasBinaryContent(ENCRYPTED_BACKUP);
        assertThat(restore.resolve(requestId + ".key")).hasContent(key + "\n");
    }

    private BackupKey serverKey() {
        return keys.current().orElseThrow(() -> new AssertionError("The test backend has no backup key"));
    }
}
