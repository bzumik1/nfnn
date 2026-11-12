package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.cucumber.TotpCodes;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class AdministrationDeviceLockStepDefinitions {

    private static final String CURRENT_DEVICE = "/api/admin/donors/devices/current";
    private static final String UNLOCK = CURRENT_DEVICE + "/unlock";
    private static final String ADMINISTRATION_COPY = CURRENT_DEVICE + "/administration-copy";
    private static final String IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
            + "Version/26.1 Mobile/15E148 Safari/604.1";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final TotpCodes totpCodes;
    private String lastCode;

    public AdministrationDeviceLockStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, TotpCodes totpCodes) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
        this.totpCodes = totpCodes;
    }

    @When("{string} unlocks the administration on this device with her/his password and a fresh code")
    public void unlocksWithThePasswordAndAFreshCode(String alias) {
        lastCode = totpCodes.freshCode(donors.secondFactorSecretOf(alias));
        unlock(alias, donors.credentialsOf(alias).password(), lastCode);
    }

    @When("{string} unlocks the administration on this device with her/his password and the same code again")
    public void unlocksWithThePasswordAndTheSameCodeAgain(String alias) {
        unlock(alias, donors.credentialsOf(alias).password(), lastCode);
    }

    @When("{string} unlocks the administration on this device with the password {string} and a fresh code")
    public void unlocksWithThePasswordAndAFreshCode(String alias, String password) {
        unlock(alias, password, totpCodes.freshCode(donors.secondFactorSecretOf(alias)));
    }

    @When("{string} unlocks the administration on this device with her/his password and the code {string}")
    public void unlocksWithThePasswordAndTheCode(String alias, String code) {
        unlock(alias, donors.credentialsOf(alias).password(), code);
    }

    @When("{string} unlocks the administration on this device with the password {string} and the code {string} {int} times")
    public void unlocksWithThePasswordAndTheCodeTimes(String alias, String password, String code, int times) {
        for (int attempt = 0; attempt < times; attempt++) {
            unlock(alias, password, code);
        }
    }

    @When("{string} unlocks the administration on this device with her/his password and the code {string} {int} times, each from another client address")
    public void unlocksWithThePasswordAndTheCodeTimesEachFromAnotherClientAddress(String alias, String code, int times) {
        for (int attempt = 0; attempt < times; attempt++) {
            api.comeFromAnotherAddress();
            unlocksWithThePasswordAndTheCode(alias, code);
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Unlock %d answered %s", attempt + 1, api.lastResponse().getBody()).isEqualTo(400);
        }
    }

    @When("{string} unlocks the administration on this device without a password and with the code {string}")
    public void unlocksWithoutAPassword(String alias, String code) {
        sessions.actAs(alias);
        api.post(UNLOCK, Map.of("secondFactorCode", code));
    }

    @When("{string} records that this device, an iPhone with Safari, stores a copy of the administration")
    public void recordsThatThisDeviceStoresACopy(String alias) {
        sessions.actAs(alias);
        api.post(ADMINISTRATION_COPY, Map.of(), Map.of(HttpHeaders.USER_AGENT, IPHONE_SAFARI));
    }

    @When("someone without a token unlocks the administration with the code {string}")
    public void someoneWithoutATokenUnlocks(String code) {
        api.forgetCredentials();
        api.post(UNLOCK, Map.of("password", "Nejake-heslo-123", "secondFactorCode", code));
    }

    @When("someone without a token records a copy of the administration")
    public void someoneWithoutATokenRecordsACopy() {
        api.forgetCredentials();
        api.post(ADMINISTRATION_COPY, Map.of());
    }

    private void unlock(String alias, String password, String code) {
        sessions.actAs(alias);
        Map<String, String> body = new HashMap<>();
        body.put("password", password);
        body.put("secondFactorCode", code);
        api.post(UNLOCK, body);
    }
}
