package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;

import java.util.Optional;

public record AdministratorIssue(DonationReceipt receipt, Optional<DonationReceipt> activeBefore) {

    public boolean tookNewNumber() {
        return activeBefore.filter(this::isReturned).isEmpty();
    }

    public Optional<ReceiptNumber> replacedActive() {
        return activeBefore.filter(active -> !isReturned(active)).map(DonationReceipt::number);
    }

    private boolean isReturned(DonationReceipt active) {
        return active.id().equals(receipt.id());
    }
}
