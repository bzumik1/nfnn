package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SymbolClaimOfferTest {

    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");
    private static final YearMonth OCTOBER = YearMonth.of(2026, 10);

    @Test
    @DisplayName("Given one payment in a single month, when the offer is made, then it starts and ends in that month")
    void should_start_and_end_in_one_month_when_made_given_single_payment() {
        SymbolClaimOffer offer = new SymbolClaimOffer(ACCOUNT, OLD_SYMBOL, 1, OCTOBER, OCTOBER);

        assertThat(offer.paymentCount()).isEqualTo(1);
        assertThat(offer.firstMonth()).isEqualTo(offer.lastMonth());
    }

    @Test
    @DisplayName("Given no payment to pair, when the offer is made, then it is refused")
    void should_refuse_when_made_given_no_payment() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SymbolClaimOffer(ACCOUNT, OLD_SYMBOL, 0, OCTOBER, OCTOBER));
    }

    @Test
    @DisplayName("Given a first month after the last, when the offer is made, then it is refused")
    void should_refuse_when_made_given_months_out_of_order() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SymbolClaimOffer(ACCOUNT, OLD_SYMBOL, 2, OCTOBER, OCTOBER.minusMonths(1)));
    }

    @Test
    @DisplayName("Given missing parts, when the offer is made, then it is refused")
    void should_refuse_when_made_given_missing_parts() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SymbolClaimOffer(null, OLD_SYMBOL, 1, OCTOBER, OCTOBER));
        assertThatIllegalArgumentException().isThrownBy(() -> new SymbolClaimOffer(ACCOUNT, null, 1, OCTOBER, OCTOBER));
        assertThatIllegalArgumentException().isThrownBy(() -> new SymbolClaimOffer(ACCOUNT, OLD_SYMBOL, 1, null, OCTOBER));
        assertThatIllegalArgumentException().isThrownBy(() -> new SymbolClaimOffer(ACCOUNT, OLD_SYMBOL, 1, OCTOBER, null));
    }
}
