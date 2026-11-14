package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ActiveYearlyReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;

import java.time.Instant;
import java.util.UUID;

record ActiveYearlyReceiptRow(UUID donorId, UUID id, String number, Instant issuedAt) {

    ActiveYearlyReceipt toDomain() {
        return new ActiveYearlyReceipt(new DonorReference(donorId), new DonationReceiptId(id), new ReceiptNumber(number), issuedAt);
    }
}
