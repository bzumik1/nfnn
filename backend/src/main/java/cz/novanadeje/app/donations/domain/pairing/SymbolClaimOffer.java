package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.YearMonth;

public record SymbolClaimOffer(SenderAccount account, VariableSymbol symbol, int paymentCount, YearMonth firstMonth, YearMonth lastMonth) {

    public SymbolClaimOffer {
        if (account == null || symbol == null || firstMonth == null || lastMonth == null) {
            throw new IllegalArgumentException("A symbol claim offer needs the account, the symbol and its first and last month");
        }
        if (paymentCount < 1) {
            throw new IllegalArgumentException("A symbol claim offer counts at least one payment: " + paymentCount);
        }
        if (firstMonth.isAfter(lastMonth)) {
            throw new IllegalArgumentException("A symbol claim offer cannot end before it starts");
        }
    }
}
