package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.AdminReceiptView;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawal;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawalReason;

import java.time.Instant;
import java.time.Year;
import java.util.UUID;

record AdminReceiptResponse(UUID id, UUID donorId, ReceiptStatus status, ReceiptKind kind, String number, UUID donationId, Integer year,
                            Instant issuedAt, Instant supersededAt, Instant withdrawnAt, ReceiptWithdrawalReason withdrawalReason, boolean donorErased,
                            FrozenReceiptResponse receipt) {

    static AdminReceiptResponse ofLiveDonor(DonationReceipt receipt) {
        return of(receipt, false, FrozenReceiptResponse.from(receipt.frozen()));
    }

    static AdminReceiptResponse from(AdminReceiptView view) {
        FrozenReceiptResponse frozen = FrozenReceiptResponse.from(view.receipt().frozen());
        return of(view.receipt(), view.donorErased(), view.donorWithheld() ? frozen.withoutErasedDonor() : frozen);
    }

    private static AdminReceiptResponse of(DonationReceipt receipt, boolean donorErased, FrozenReceiptResponse frozen) {
        return new AdminReceiptResponse(receipt.id().value(), receipt.donor().value(), receipt.status(), receipt.kind(), receipt.number().value(),
                receipt.donation().map(DonationId::value).orElse(null), receipt.year().map(Year::getValue).orElse(null), receipt.issuedAt(),
                receipt.supersededAt().orElse(null), receipt.withdrawal().map(ReceiptWithdrawal::at).orElse(null),
                receipt.withdrawal().map(ReceiptWithdrawal::reason).orElse(null), donorErased, frozen);
    }
}
