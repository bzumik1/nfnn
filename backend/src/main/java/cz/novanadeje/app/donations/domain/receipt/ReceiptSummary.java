package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Optional;

public record ReceiptSummary(DonationReceiptId id, DonorReference donor, ReceiptKind kind, ReceiptNumber number, Optional<DonationId> donation,
                             Optional<Year> year, Year certifiedYear, LocalDate issuedOn, Instant issuedAt, LocaleCode locale, ReceiptStatus status,
                             Optional<Instant> supersededAt, Optional<ReceiptWithdrawal> withdrawal, int giftCount, long totalAmountMinor,
                             ReceiptSigningKeyId keyId) {

    public ReceiptSummary {
        if (id == null || donor == null || kind == null || number == null || donation == null || year == null || certifiedYear == null
                || issuedOn == null || issuedAt == null || locale == null || status == null || supersededAt == null || withdrawal == null || keyId == null) {
            throw new IllegalArgumentException("A receipt summary names the receipt, its donor, kind, number, year, issue, locale, status and key");
        }
        if (giftCount < 1) {
            throw new IllegalArgumentException("A receipt certifies at least one gift");
        }
        if (year.isPresent() && !year.get().equals(certifiedYear)) {
            throw new IllegalArgumentException("A yearly receipt certifies the gifts of its own year");
        }
    }

    public static ReceiptSummary of(DonationReceipt receipt) {
        ReceiptDocument document = receipt.frozen().document();
        return new ReceiptSummary(receipt.id(), receipt.donor(), receipt.kind(), receipt.number(), receipt.donation(), receipt.year(),
                receipt.year().orElseGet(() -> Year.from(document.lines().getFirst().receivedOn())), receipt.issuedOn(), receipt.issuedAt(),
                receipt.locale(), receipt.status(), receipt.supersededAt(), receipt.withdrawal(), document.lines().size(),
                document.total().amountMinor(), receipt.frozen().verification().keyId());
    }
}
