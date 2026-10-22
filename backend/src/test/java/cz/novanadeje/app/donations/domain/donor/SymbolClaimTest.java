package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SymbolClaimTest {

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final DonorReference JANA = new DonorReference(UuidV7.generate(NOW));
    private static final SenderAccount ACCOUNT = new SenderAccount("1234567", "0800");
    private static final SenderAccount OTHER_ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");

    @Test
    @DisplayName("Given a confirmed claim, when payments are offered, then it confirms only a payment from its account with its symbol")
    void should_confirm_only_own_account_and_symbol_when_offered_given_confirmed_claim() {
        SymbolClaim claim = claim(SymbolClaimAnswer.CONFIRMED);

        assertThat(claim.confirms(payment(1, Optional.of(ACCOUNT), "6123456789"))).isTrue();
        assertThat(claim.confirms(payment(2, Optional.of(ACCOUNT), "006123456789"))).isTrue();
        assertThat(claim.confirms(payment(3, Optional.of(OTHER_ACCOUNT), "6123456789"))).isFalse();
        assertThat(claim.confirms(payment(4, Optional.of(ACCOUNT), "6123456788"))).isFalse();
        assertThat(claim.confirms(payment(5, Optional.of(ACCOUNT), null))).isFalse();
        assertThat(claim.confirms(payment(6, Optional.empty(), "6123456789"))).isFalse();
        assertThat(claim.isConfirmed()).isTrue();
    }

    @Test
    @DisplayName("Given a declined claim, when a payment from its account with its symbol is offered, then it confirms nothing")
    void should_confirm_nothing_when_offered_given_declined_claim() {
        SymbolClaim claim = claim(SymbolClaimAnswer.DECLINED);

        assertThat(claim.confirms(payment(1, Optional.of(ACCOUNT), "6123456789"))).isFalse();
        assertThat(claim.isConfirmed()).isFalse();
    }

    @Test
    @DisplayName("Given either answer, when asked whether it answers its account and symbol, then it does, and not another account or symbol")
    void should_answer_own_account_and_symbol_when_asked_given_either_answer() {
        for (SymbolClaimAnswer answer : SymbolClaimAnswer.values()) {
            SymbolClaim claim = claim(answer);

            assertThat(claim.answers(ACCOUNT, OLD_SYMBOL)).isTrue();
            assertThat(claim.answers(OTHER_ACCOUNT, OLD_SYMBOL)).isFalse();
            assertThat(claim.answers(ACCOUNT, new VariableSymbol("6123456788"))).isFalse();
        }
    }

    @Test
    @DisplayName("Given an answer, when the claim is made, then it keeps the donor, the account, the symbol, the answer and the time")
    void should_keep_every_part_when_answered_given_answer() {
        SymbolClaimId id = SymbolClaimId.newId(NOW);

        SymbolClaim claim = SymbolClaim.answer(id, JANA, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, NOW);

        assertThat(claim.id()).isEqualTo(id);
        assertThat(claim.donor()).isEqualTo(JANA);
        assertThat(claim.account()).isEqualTo(ACCOUNT);
        assertThat(claim.symbol()).isEqualTo(OLD_SYMBOL);
        assertThat(claim.answer()).isEqualTo(SymbolClaimAnswer.CONFIRMED);
        assertThat(claim.answeredAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a symbol with a leading zero or the symbol 0, when a claim is made or reconstituted, then it is refused")
    void should_refuse_when_made_given_symbol_not_in_matching_form() {
        assertThatIllegalArgumentException().isThrownBy(() -> SymbolClaim.answer(SymbolClaimId.newId(NOW), JANA, ACCOUNT,
                new VariableSymbol("0612345678"), SymbolClaimAnswer.CONFIRMED, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), JANA, ACCOUNT,
                new VariableSymbol("0"), SymbolClaimAnswer.DECLINED, NOW));
    }

    @Test
    @DisplayName("Given missing parts, when a claim is made, then it is refused")
    void should_refuse_when_made_given_missing_parts() {
        assertThatIllegalArgumentException().isThrownBy(() -> SymbolClaim.answer(null, JANA, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> SymbolClaim.answer(SymbolClaimId.newId(NOW), null, ACCOUNT, OLD_SYMBOL,
                SymbolClaimAnswer.CONFIRMED, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> SymbolClaim.answer(SymbolClaimId.newId(NOW), JANA, null, OLD_SYMBOL,
                SymbolClaimAnswer.CONFIRMED, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> SymbolClaim.answer(SymbolClaimId.newId(NOW), JANA, ACCOUNT, null,
                SymbolClaimAnswer.CONFIRMED, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> SymbolClaim.answer(SymbolClaimId.newId(NOW), JANA, ACCOUNT, OLD_SYMBOL, null, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> SymbolClaim.answer(SymbolClaimId.newId(NOW), JANA, ACCOUNT, OLD_SYMBOL,
                SymbolClaimAnswer.CONFIRMED, null));
    }

    @Test
    void should_round_trip_when_parsed_given_symbol_claim_id_text() {
        SymbolClaimId id = SymbolClaimId.newId(NOW);

        assertThat(SymbolClaimId.of(id.toString())).isEqualTo(id);
    }

    private static SymbolClaim claim(SymbolClaimAnswer answer) {
        return SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), JANA, ACCOUNT, OLD_SYMBOL, answer, NOW);
    }
}
