package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptPage;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.UUID;

record AdminReceiptListResponse(List<AdminReceiptItemResponse> items, long total, int page, int limit) {

    static AdminReceiptListResponse from(ReceiptPage receipts, int page, int limit) {
        return new AdminReceiptListResponse(receipts.items().stream().map(AdminReceiptItemResponse::from).toList(), receipts.total(), page, limit);
    }

    record AdminReceiptItemResponse(UUID id, UUID donorId, ReceiptStatus status, ReceiptKind kind, String number, UUID donationId, Integer year,
                                    LocalDate issuedOn, Instant issuedAt, Instant supersededAt, String locale, int giftCount, long totalAmountMinor) {

        static AdminReceiptItemResponse from(DonationReceipt receipt) {
            return new AdminReceiptItemResponse(receipt.id().value(), receipt.donor().value(), receipt.status(), receipt.kind(),
                    receipt.number().value(), receipt.donation().map(DonationId::value).orElse(null), receipt.year().map(Year::getValue).orElse(null),
                    receipt.issuedOn(), receipt.issuedAt(), receipt.supersededAt().orElse(null), receipt.locale().tag(),
                    receipt.frozen().document().lines().size(), receipt.frozen().document().total().amountMinor());
        }
    }
}
