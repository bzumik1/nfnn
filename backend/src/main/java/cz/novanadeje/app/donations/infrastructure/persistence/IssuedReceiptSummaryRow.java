package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSummary;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawal;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawalReason;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Optional;
import java.util.UUID;

record IssuedReceiptSummaryRow(UUID id, UUID donorId, ReceiptKind kind, String number, UUID donationId, Integer receiptYear, LocalDate issuedOn,
                               Instant issuedAt, String locale, ReceiptStatus status, Instant supersededAt, Instant withdrawnAt,
                               ReceiptWithdrawalReason withdrawalReason, Integer giftCount, Long totalAmountMinor, Integer certifiedYear) {

    ReceiptSummary toSummary() {
        return new ReceiptSummary(new DonationReceiptId(id), new DonorReference(donorId), kind, new ReceiptNumber(number),
                Optional.ofNullable(donationId).map(DonationId::new), Optional.ofNullable(receiptYear).map(Year::of), Year.of(certifiedYear), issuedOn,
                issuedAt, LocaleCode.fromTag(locale), status, Optional.ofNullable(supersededAt),
                Optional.ofNullable(withdrawnAt).map(at -> new ReceiptWithdrawal(at, withdrawalReason)), giftCount, totalAmountMinor);
    }
}
