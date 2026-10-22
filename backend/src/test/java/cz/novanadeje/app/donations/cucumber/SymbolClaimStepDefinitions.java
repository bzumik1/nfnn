package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import tools.jackson.databind.JsonNode;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

public class SymbolClaimStepDefinitions {

    private final ScenarioDonors scenarioDonors;
    private final SymbolClaimRepository claims;
    private final ApiClient api;
    private final Clock clock;

    public SymbolClaimStepDefinitions(ScenarioDonors scenarioDonors, SymbolClaimRepository claims, ApiClient api, Clock clock) {
        this.scenarioDonors = scenarioDonors;
        this.claims = claims;
        this.api = api;
        this.clock = clock;
    }

    @Given("{string} has confirmed symbol {string} from bank account {string}")
    public void hasConfirmedSymbolFromBankAccount(String alias, String symbol, String account) {
        Instant now = clock.instant();
        SymbolClaim claim = SymbolClaim.answer(SymbolClaimId.newId(now), donor(alias), senderAccount(account), new VariableSymbol(symbol),
                SymbolClaimAnswer.CONFIRMED, now);
        assertThat(claims.saveIfAbsent(claim)).withFailMessage("\"%s\" has already answered symbol %s from %s", alias, symbol, account).isTrue();
    }

    @Then("the confirmation paired {int} payment(s) and changed no yearly receipt")
    public void theConfirmationPairedAndChangedNoYearlyReceipt(int pairedCount) {
        assertConfirmation(pairedCount, List.of());
    }

    @Then("the confirmation paired {int} payment(s) and changed the yearly receipt for {int}")
    public void theConfirmationPairedAndChangedTheYearlyReceiptFor(int pairedCount, int year) {
        assertConfirmation(pairedCount, List.of(year));
    }

    @Then("the stored answer of {string} to symbol {string} from bank account {string} is {string}")
    public void theStoredAnswerIs(String alias, String symbol, String account, String answer) {
        assertThat(claims.findByDonor(donor(alias)))
                .filteredOn(claim -> claim.answers(senderAccount(account), new VariableSymbol(symbol)))
                .singleElement()
                .satisfies(claim -> assertThat(claim.answer()).isEqualTo(SymbolClaimAnswer.valueOf(answer)));
    }

    private void assertConfirmation(int pairedCount, List<Integer> changedYearlyReceipts) {
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The confirmation failed: %s", api.lastResponse().getBody())
                .isEqualTo(200);
        JsonNode json = api.lastResponseJson();
        assertThat(json.get("pairedCount").asInt()).isEqualTo(pairedCount);
        assertThat(json.get("changedYearlyReceipts").valueStream().map(JsonNode::asInt).toList()).containsExactlyElementsOf(changedYearlyReceipts);
    }

    private DonorReference donor(String alias) {
        return new DonorReference(scenarioDonors.idOf(alias));
    }

    private static SenderAccount senderAccount(String display) {
        String[] parts = display.split("/");
        return new SenderAccount(parts[0], parts[1]);
    }
}
