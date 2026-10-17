package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.util.Optional;
import java.util.UUID;

public record PaymentFacts(UUID paymentId, Optional<VariableSymbol> matchingVariableSymbol, Optional<SenderAccount> sender) {

    public PaymentFacts {
        if (paymentId == null || matchingVariableSymbol == null || sender == null) {
            throw new IllegalArgumentException("Payment facts need the payment id, the matching symbol and the sender, each possibly empty");
        }
    }
}
