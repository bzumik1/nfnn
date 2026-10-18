package cz.novanadeje.app.donations.application.bankaccount;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.shared.domain.Money;

import java.time.LocalDate;
import java.util.Optional;

public record BankAccountView(SenderAccountLink link, int donationCount, Money total, Optional<LocalDate> lastDonationOn, boolean shared) {

    public BankAccountView {
        if (link == null || total == null || lastDonationOn == null) {
            throw new IllegalArgumentException("A bank account view needs the link, the total and the last donation day");
        }
    }

    public Optional<LocalDate> verifiedOn() {
        return link.provedAt().map(at -> at.atZone(FoundationCalendar.ZONE).toLocalDate());
    }
}
