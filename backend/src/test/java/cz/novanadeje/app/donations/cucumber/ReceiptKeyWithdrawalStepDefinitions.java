package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.cucumber.TotpCodes;
import cz.novanadeje.app.donors.cucumber.DonorPasskeyStepDefinitions;
import cz.novanadeje.app.operations.infrastructure.backup.BackupProperties;
import cz.novanadeje.app.support.RecordingApplicationRestarter;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

public class ReceiptKeyWithdrawalStepDefinitions {

    private static final String KEYS = "/api/admin/donations/receipt-signing-keys/";
    private static final String SEED_REQUEST = "receipt-signing-key.renew";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final TotpCodes totpCodes;
    private final DonorPasskeyStepDefinitions passkeys;
    private final JdbcClient jdbc;
    private final RecordingApplicationRestarter restarter;
    private final Path seedRequest;
    private final Map<String, Map<String, Object>> copiedRows = new HashMap<>();

    public ReceiptKeyWithdrawalStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, TotpCodes totpCodes,
                                               DonorPasskeyStepDefinitions passkeys, JdbcClient jdbc, RecordingApplicationRestarter restarter,
                                               BackupProperties backups) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
        this.totpCodes = totpCodes;
        this.passkeys = passkeys;
        this.jdbc = jdbc;
        this.restarter = restarter;
        this.seedRequest = backups.restoreDirectory().resolve(SEED_REQUEST);
    }

    @Before
    public void forgetEarlierRestarts() {
        restarter.reset();
    }

    @When("{string} withdraws the receipt signing key {string} with a fresh code")
    public void withdrawsWithAFreshCode(String alias, String keyId) {
        sessions.actAs(alias);
        api.post(KEYS + keyId + "/withdrawal", Map.of("secondFactorCode", totpCodes.freshCode(donors.secondFactorSecretOf(alias))));
    }

    @Given("{string} withdrew the receipt signing key {string} with a fresh code")
    public void withdrewWithAFreshCode(String alias, String keyId) {
        withdrawsWithAFreshCode(alias, keyId);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Withdrawing answered %s", api.lastResponse().getBody()).isEqualTo(200);
    }

    @When("{string} withdraws the receipt signing key {string} with the code {string}")
    public void withdrawsWithTheCode(String alias, String keyId, String code) {
        sessions.actAs(alias);
        api.post(KEYS + keyId + "/withdrawal", Map.of("secondFactorCode", code));
    }

    @When("{string} withdraws the receipt signing key {string} without confirming it again")
    public void withdrawsWithoutConfirming(String alias, String keyId) {
        sessions.actAs(alias);
        api.post(KEYS + keyId + "/withdrawal", Map.of());
    }

    @When("{string} withdraws the receipt signing key {string} with the passkey {string}")
    public void withdrawsWithThePasskey(String alias, String keyId, String name) {
        sessions.actAs(alias);
        Map<String, Object> answer = passkeys.passkeyConfirmation(alias, name);
        api.post(KEYS + keyId + "/withdrawal", Map.of("passkey", answer));
    }

    @When("someone without a token withdraws the receipt signing key {string}")
    public void someoneWithoutATokenWithdraws(String keyId) {
        api.forgetCredentials();
        api.post(KEYS + keyId + "/withdrawal", Map.of("secondFactorCode", "123456"));
    }

    @Given("{string} tried to withdraw the receipt signing key {string} with a wrong code {int} times")
    public void triedToWithdrawWithAWrongCode(String alias, String keyId, int times) {
        for (int attempt = 0; attempt < times; attempt++) {
            withdrawsWithTheCode(alias, keyId, "000000");
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Withdrawing answered %s", api.lastResponse().getBody()).isIn(400, 409);
        }
    }

    @Then("the withdrawal answer says the backend restarts: {word}")
    public void theWithdrawalAnswerSaysTheBackendRestarts(String restarting) {
        assertThat(api.lastResponseJson().get("restarting").asBoolean()).isEqualTo(Boolean.parseBoolean(restarting));
    }

    @Then("the backend restarts once to replace the seed of the receipt signing key {string}")
    public void theBackendRestartsToReplaceTheSeed(String keyId) {
        await().until(() -> restarter.restarts() > 0);
        assertThat(restarter.restarts()).isEqualTo(1);
        assertThat(seedRequest).hasContent(keyId);
    }

    @Then("the backend is not restarted for a new receipt signing seed")
    public void theBackendIsNotRestarted() {
        assertThat(restarter.restarts()).isZero();
        assertThat(seedRequest).doesNotExist();
    }

    @Given("the row of the receipt signing key {string} was copied as it stands")
    public void theRowWasCopied(String keyId) {
        copiedRows.put(keyId, jdbc.sql("select key_id, public_key, registered_at, status, seal from receipt_signing_key where key_id = ?").param(keyId)
                .query().singleRow());
    }

    @Given("the copied row of the receipt signing key {string} was written back in the database")
    public void theCopiedRowWasWrittenBack(String keyId) {
        Map<String, Object> row = copiedRows.get(keyId);
        assertThat(jdbc.sql("update receipt_signing_key set status = ?, seal = ? where key_id = ?").params(row.get("status"), row.get("seal"), keyId)
                .update()).isEqualTo(1);
    }

    @Given("the row of the receipt signing key {string} was deleted in the database")
    public void theRowWasDeleted(String keyId) {
        assertThat(jdbc.sql("delete from receipt_signing_key where key_id = ?").param(keyId).update()).isEqualTo(1);
    }

    @Then("the receipt signing keys flag in the audit trail:")
    public void theReceiptSigningKeysFlag(DataTable expected) {
        assertThat(mismatches()).isEqualTo(expected.asMaps());
    }

    @Then("the receipt signing keys flag nothing in the audit trail")
    public void theReceiptSigningKeysFlagNothing() {
        assertThat(mismatches()).isEmpty();
    }

    private List<Map<String, String>> mismatches() {
        JsonNode answer = api.lastResponseJson();
        assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        return answer.get("auditMismatches").values().stream()
                .map(mismatch -> Map.of("keyId", mismatch.get("keyId").asString(), "kind", mismatch.get("kind").asString()))
                .toList();
    }
}
