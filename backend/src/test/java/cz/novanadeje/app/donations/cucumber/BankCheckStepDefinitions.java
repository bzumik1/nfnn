package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class BankCheckStepDefinitions {

    private static final String BANK_CHECK_PATH = "/api/donations/me/bank-check";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final MutableClock clock;
    private final BankImportStateRepository states;

    public BankCheckStepDefinitions(ApiClient api, DonorSessions sessions, MutableClock clock, BankImportStateRepository states) {
        this.api = api;
        this.sessions = sessions;
        this.clock = clock;
        this.states = states;
    }

    @When("{string} asks for the bank to be checked")
    public void asksForTheBankToBeChecked(String alias) {
        sessions.actAs(alias);
        api.post(BANK_CHECK_PATH, Map.of());
    }

    @When("{string} asks whether the bank is being checked")
    public void asksWhetherTheBankIsBeingChecked(String alias) {
        sessions.actAs(alias);
        api.get(BANK_CHECK_PATH);
    }

    @When("someone without a token asks for the bank to be checked")
    public void someoneWithoutATokenAsksForTheBankToBeChecked() {
        api.forgetCredentials();
        api.post(BANK_CHECK_PATH, Map.of());
    }

    @When("someone without a token asks whether the bank is being checked")
    public void someoneWithoutATokenAsksWhetherTheBankIsBeingChecked() {
        api.forgetCredentials();
        api.get(BANK_CHECK_PATH);
    }

    @Then("the bank data is as of now")
    public void theBankDataIsAsOfNow() {
        assertThat(bankDataAsOf()).isEqualTo(clock.instant());
    }

    @Then("the bank data is {int} minutes old")
    public void theBankDataIsMinutesOld(int minutes) {
        assertThat(bankDataAsOf()).isEqualTo(clock.instant().minus(Duration.ofMinutes(minutes)));
    }

    @Then("the bank data is not available yet")
    public void theBankDataIsNotAvailableYet() {
        assertThat(api.lastResponseJson().get("bankDataAsOf").isNull()).isTrue();
    }

    @Then("the bank is not being checked")
    public void theBankIsNotBeingChecked() {
        assertThat(api.lastResponseJson().get("checking").asBoolean()).isFalse();
    }

    @Then("the import state records that Fio was unreachable")
    public void theImportStateRecordsThatFioWasUnreachable() {
        assertThat(states.current().lastFailureKind()).contains(ImportFailureKind.TRANSPORT);
        assertThat(states.current().lastAttemptedAt()).contains(clock.instant());
    }

    private Instant bankDataAsOf() {
        JsonNode asOf = api.lastResponseJson().get("bankDataAsOf");
        assertThat(asOf.isNull()).withFailMessage("The bank data has no time: %s", api.lastResponse().getBody()).isFalse();
        return Instant.parse(asOf.asString());
    }
}
