package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.shared.domain.Money;

import java.time.LocalDate;

public record ReceiptLine(DonationId donationId, LocalDate receivedOn, Money amount, DonationSource source) {

    public ReceiptLine {
        if (donationId == null || receivedOn == null || amount == null || source == null) {
            throw new IllegalArgumentException("A receipt line needs the donation, its date, amount and source");
        }
        if (!amount.isPositive()) {
            throw new IllegalArgumentException("A receipt line has a positive amount: " + amount);
        }
    }
}
