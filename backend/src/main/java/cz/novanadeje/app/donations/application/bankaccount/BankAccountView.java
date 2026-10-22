package cz.novanadeje.app.donations.application.bankaccount;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.pairing.SymbolClaimOffer;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public record BankAccountView(SenderAccountLink link, int donationCount, Money total, Optional<LocalDate> lastDonationOn, boolean shared,
                              boolean pairingExcluded, Optional<SymbolClaimOffer> symbolOffer, List<VariableSymbol> confirmedSymbols,
                              Optional<LocalDate> verificationPaymentOn) {

    public BankAccountView {
        if (link == null || total == null || lastDonationOn == null) {
            throw new IllegalArgumentException("A bank account view needs the link, the total and the last donation day");
        }
        if (symbolOffer == null || confirmedSymbols == null || verificationPaymentOn == null) {
            throw new IllegalArgumentException("A bank account view needs the symbol offer, the confirmed symbols and the verification payment day");
        }
        confirmedSymbols = List.copyOf(confirmedSymbols);
    }

    public Optional<LocalDate> verifiedOn() {
        return link.provedAt().map(at -> at.atZone(FoundationCalendar.ZONE).toLocalDate());
    }
}
