package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import io.cucumber.java.en.Given;

import java.time.Clock;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

public class SymbolClaimStepDefinitions {

    private final ScenarioDonors scenarioDonors;
    private final SymbolClaimRepository claims;
    private final Clock clock;

    public SymbolClaimStepDefinitions(ScenarioDonors scenarioDonors, SymbolClaimRepository claims, Clock clock) {
        this.scenarioDonors = scenarioDonors;
        this.claims = claims;
        this.clock = clock;
    }

    @Given("{string} has confirmed symbol {string} from bank account {string}")
    public void hasConfirmedSymbolFromBankAccount(String alias, String symbol, String account) {
        answer(alias, symbol, account, SymbolClaimAnswer.CONFIRMED);
    }

    @Given("{string} has declined symbol {string} from bank account {string}")
    public void hasDeclinedSymbolFromBankAccount(String alias, String symbol, String account) {
        answer(alias, symbol, account, SymbolClaimAnswer.DECLINED);
    }

    private void answer(String alias, String symbol, String account, SymbolClaimAnswer answer) {
        Instant now = clock.instant();
        SymbolClaim claim = SymbolClaim.answer(SymbolClaimId.newId(now), new DonorReference(scenarioDonors.idOf(alias)), senderAccount(account),
                new VariableSymbol(symbol), answer, now);
        assertThat(claims.saveIfAbsent(claim)).withFailMessage("\"%s\" has already answered symbol %s from %s", alias, symbol, account).isTrue();
    }

    private static SenderAccount senderAccount(String display) {
        String[] parts = display.split("/");
        return new SenderAccount(parts[0], parts[1]);
    }
}
