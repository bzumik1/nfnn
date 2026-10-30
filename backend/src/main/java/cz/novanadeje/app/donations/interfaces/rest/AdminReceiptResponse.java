package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;

import java.time.Instant;
import java.time.Year;
import java.util.UUID;

record AdminReceiptResponse(UUID id, UUID donorId, ReceiptStatus status, ReceiptKind kind, String number, UUID donationId, Integer year,
                            Instant issuedAt, Instant supersededAt, FrozenReceiptResponse receipt) {

    static AdminReceiptResponse from(DonationReceipt receipt) {
        return new AdminReceiptResponse(receipt.id().value(), receipt.donor().value(), receipt.status(), receipt.kind(), receipt.number().value(),
                receipt.donation().map(DonationId::value).orElse(null), receipt.year().map(Year::getValue).orElse(null), receipt.issuedAt(),
                receipt.supersededAt().orElse(null), FrozenReceiptResponse.from(receipt.frozen()));
    }
}
