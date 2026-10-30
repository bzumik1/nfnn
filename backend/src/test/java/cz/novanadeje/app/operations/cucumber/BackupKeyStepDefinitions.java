package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.cucumber.TotpCodes;
import cz.novanadeje.app.donors.cucumber.DonorPasskeyStepDefinitions;
import cz.novanadeje.app.operations.application.backup.BackupKeySource;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.infrastructure.backup.BackupProperties;
import cz.novanadeje.app.operations.infrastructure.settings.PublicDevelopmentKeys;
import cz.novanadeje.app.support.SwitchablePublicBackupKeyPolicy;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
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
    private final SwitchablePublicBackupKeyPolicy publicKeys;
    private final Path restore;
    private String lastCode;
    private List<Integer> askedPositions = List.of();

    public BackupKeyStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, TotpCodes totpCodes,
                                    DonorPasskeyStepDefinitions passkeys, BackupKeySource keys, SwitchablePublicBackupKeyPolicy publicKeys,
                                    BackupProperties properties) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
        this.totpCodes = totpCodes;
        this.passkeys = passkeys;
        this.keys = keys;
        this.publicKeys = publicKeys;
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
        sessions.actAs(alias);
        lastCode = totpCodes.freshCode(donors.secondFactorSecretOf(alias));
        api.post(KEY + "/reveal", Map.of("secondFactorCode", lastCode));
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

    @When("{string} confirms the backup key with the words {string}, {string} and {string} at {int}, {int} and {int}")
    public void confirmsTheBackupKeyWithTheWords(String alias, String first, String second, String third, int firstAt, int secondAt, int thirdAt) {
        confirmsTheBackupKeyWith(alias, List.of(word(firstAt, first), word(secondAt, second), word(thirdAt, third)));
    }

    @Then("the answer asks for three different words of the key")
    public void theAnswerAsksForThreeDifferentWordsOfTheKey() {
        askedPositions = api.lastResponseJson().get("checkPositions").valueStream().map(JsonNode::asInt).toList();
        assertThat(askedPositions).hasSize(3).doesNotHaveDuplicates().isSorted().allSatisfy(position -> assertThat(position).isBetween(1, 24));
    }

    @When("{string} confirms the backup key with the asked words")
    public void confirmsTheBackupKeyWithTheAskedWords(String alias) {
        List<String> words = serverKey().words();
        confirmsTheBackupKeyWith(alias, askedPositions.stream().map(position -> word(position, words.get(position - 1).toUpperCase())).toList());
    }

    @When("{string} confirms the backup key with the asked words in the wrong order")
    public void confirmsTheBackupKeyWithTheAskedWordsInTheWrongOrder(String alias) {
        List<String> words = serverKey().words();
        List<Integer> shifted = List.of(askedPositions.get(1), askedPositions.get(2), askedPositions.getFirst());
        confirmsTheBackupKeyWith(alias, List.of(word(askedPositions.get(0), words.get(shifted.get(0) - 1)),
                word(askedPositions.get(1), words.get(shifted.get(1) - 1)), word(askedPositions.get(2), words.get(shifted.get(2) - 1))));
    }

    @Given("{string} tried to confirm the backup key {int} times")
    public void triedToConfirmTheBackupKey(String alias, int times) {
        for (int i = 0; i < times; i++) {
            confirmsTheBackupKeyWithTheWords(alias, "abeceda", "abeceda", "abeceda", 1, 2, 3);
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Confirming answered %s", api.lastResponse().getBody()).isEqualTo(409);
        }
    }

    private void confirmsTheBackupKeyWith(String alias, List<Map<String, Object>> words) {
        sessions.actAs(alias);
        api.post(KEY + "/confirmation", Map.of("words", words));
    }

    private static Map<String, Object> word(int position, String word) {
        return Map.of("position", position, "word", word);
    }

    @Given("{string} tried to reveal the backup key with a wrong code {int} times")
    public void triedToRevealTheBackupKeyWithAWrongCode(String alias, int times) {
        for (int i = 0; i < times; i++) {
            revealsTheBackupKeyWithTheCode(alias, "000000");
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Revealing answered %s", api.lastResponse().getBody()).isEqualTo(400);
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

    @Given("the backend runs outside development")
    public void theBackendRunsOutsideDevelopment() {
        publicKeys.runOutsideDevelopment();
    }

    @When("an encrypted backup is uploaded in the first setup with the public development backup key")
    public void anEncryptedBackupIsUploadedWithThePublicDevelopmentKey() {
        anEncryptedBackupIsUploadedWithTheKey(developmentKey().value());
    }

    @When("an encrypted backup is uploaded in the first setup with the 24 words of the public development backup key")
    public void anEncryptedBackupIsUploadedWithTheWordsOfThePublicDevelopmentKey() {
        anEncryptedBackupIsUploadedWithTheKey(String.join(" ", developmentKey().words()));
    }

    @Then("the uploaded backup waits in the restore folder beside the public development backup key")
    public void theUploadedBackupWaitsBesideThePublicDevelopmentKey() {
        theUploadedBackupWaitsBesideTheKey(developmentKey().value());
    }

    @Then("the uploaded backup waits in the restore folder beside the key {string}")
    public void theUploadedBackupWaitsBesideTheKey(String key) {
        String requestId = api.lastResponseJson().get("requestId").asString();
        assertThat(restore.resolve(requestId + ".upload")).hasBinaryContent(ENCRYPTED_BACKUP);
        assertThat(restore.resolve(requestId + ".key")).hasContent(key + "\n");
    }

    private static BackupKey developmentKey() {
        return PublicDevelopmentKeys.ofDevelopmentProfile().backupKey().orElseThrow(() -> new AssertionError("application-dev.yml has no backup key"));
    }

    private BackupKey serverKey() {
        return keys.current().orElseThrow(() -> new AssertionError("The test backend has no backup key"));
    }
}
