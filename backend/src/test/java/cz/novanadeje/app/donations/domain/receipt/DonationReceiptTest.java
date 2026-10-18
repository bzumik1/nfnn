package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.Year;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.PDF_DIGEST;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SNAPSHOT;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SNAPSHOT_CONTENT;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class DonationReceiptTest {

    private static final DonationReceiptId ID = DonationReceiptId.newId(NOW);
    private static final DonationId DONATION = DonationId.newId(NOW);
    private static final ReceiptFingerprint FINGERPRINT = new ReceiptFingerprint("a".repeat(64));
    private static final ReceiptFingerprint OTHER_FINGERPRINT = new ReceiptFingerprint("b".repeat(64));
    private static final byte[] PDF = {'%', 'P', 'D', 'F'};

    @Test
    @DisplayName("Given a donation, when its receipt is issued, then it is an active single receipt of that donation without a year")
    void should_be_active_single_receipt_when_issued_given_donation() {
        DonationReceipt receipt = single(Optional.empty());

        assertThat(receipt.id()).isEqualTo(ID);
        assertThat(receipt.donor()).isEqualTo(JANA);
        assertThat(receipt.kind()).isEqualTo(ReceiptKind.SINGLE);
        assertThat(receipt.donation()).contains(DONATION);
        assertThat(receipt.year()).isEmpty();
        assertThat(receipt.number()).isEqualTo(FIRST_NUMBER);
        assertThat(receipt.issuedOn()).isEqualTo(TODAY);
        assertThat(receipt.issuedAt()).isEqualTo(NOW);
        assertThat(receipt.locale()).isEqualTo(LocaleCode.CS);
        assertThat(receipt.fingerprint()).isEqualTo(FINGERPRINT);
        assertThat(receipt.content()).isEqualTo(SNAPSHOT_CONTENT);
        assertThat(receipt.supersedes()).isEmpty();
        assertThat(receipt.supersededAt()).isEmpty();
        assertThat(receipt.isActive()).isTrue();
    }

    @Test
    @DisplayName("Given a year, when its receipt is issued as a replacement, then it is a yearly receipt of that year naming the replaced one")
    void should_be_yearly_replacement_when_issued_given_year_and_replaced_receipt() {
        DonationReceiptId replaced = DonationReceiptId.newId(NOW.minusSeconds(60));

        DonationReceipt receipt = DonationReceipt.issueForYear(ID, JANA, YEAR_2026, FIRST_NUMBER, TODAY, NOW, LocaleCode.EN, FINGERPRINT,
                SNAPSHOT_CONTENT, Optional.of(replaced));

        assertThat(receipt.kind()).isEqualTo(ReceiptKind.YEARLY);
        assertThat(receipt.year()).contains(YEAR_2026);
        assertThat(receipt.donation()).isEmpty();
        assertThat(receipt.supersedes()).contains(replaced);
        assertThat(receipt.locale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given a kind that does not match what is set, when a receipt is reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_kind_not_matching_donation_or_year() {
        assertThatIllegalArgumentException().isThrownBy(() -> reconstitute(ReceiptKind.SINGLE, Optional.empty(), Optional.of(YEAR_2026)));
        assertThatIllegalArgumentException().isThrownBy(() -> reconstitute(ReceiptKind.SINGLE, Optional.of(DONATION), Optional.of(YEAR_2026)));
        assertThatIllegalArgumentException().isThrownBy(() -> reconstitute(ReceiptKind.YEARLY, Optional.of(DONATION), Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> reconstitute(ReceiptKind.YEARLY, Optional.empty(), Optional.empty()));
        assertThat(reconstitute(ReceiptKind.YEARLY, Optional.empty(), Optional.of(YEAR_2026)).year()).contains(YEAR_2026);
    }

    @Test
    @DisplayName("Given no content, when a receipt is issued or reconstituted, then it is refused")
    void should_refuse_when_issued_given_no_content() {
        assertThatIllegalArgumentException().isThrownBy(() -> DonationReceipt.issueForDonation(ID, JANA, DONATION, FIRST_NUMBER, TODAY, NOW,
                LocaleCode.CS, FINGERPRINT, null, Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> DonationReceipt.reconstitute(ID, JANA, ReceiptKind.SINGLE, Optional.of(DONATION),
                Optional.empty(), FIRST_NUMBER, TODAY, NOW, LocaleCode.CS, FINGERPRINT, null, Optional.empty(), Optional.empty()));
    }

    @Test
    @DisplayName("Given a receipt stored as a PDF before snapshots, when it is reconstituted, then it keeps that PDF as its content")
    void should_keep_stored_pdf_when_reconstituted_given_receipt_from_before_snapshots() {
        DonationReceipt receipt = DonationReceipt.reconstitute(ID, JANA, ReceiptKind.SINGLE, Optional.of(DONATION), Optional.empty(), FIRST_NUMBER,
                TODAY, NOW, LocaleCode.CS, FINGERPRINT, new ReceiptContent.StoredPdf(PDF), Optional.empty(), Optional.empty());

        assertThat(receipt.content()).isEqualTo(new ReceiptContent.StoredPdf(PDF));
    }

    @Test
    @DisplayName("Given an empty PDF, when it is kept as receipt content, then it is refused")
    void should_refuse_when_kept_given_empty_pdf() {
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptContent.StoredPdf(new byte[0]));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptContent.StoredPdf(null));
    }

    @Test
    @DisplayName("Given the bytes a stored PDF was made from, when either side changes its array, then the content keeps its own copy")
    void should_keep_own_copy_of_pdf_when_arrays_change_given_stored_pdf() {
        byte[] pdf = PDF.clone();
        ReceiptContent.StoredPdf stored = new ReceiptContent.StoredPdf(pdf);

        pdf[0] = 'X';
        stored.pdf()[1] = 'X';

        assertThat(stored.pdf()).isEqualTo(PDF);
    }

    @Test
    @DisplayName("Given a snapshot without the digest of its issued PDF, when it is kept as receipt content, then it is refused")
    void should_refuse_when_kept_given_snapshot_without_pdf_digest() {
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptContent.Snapshot(SNAPSHOT, null));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptContent.Snapshot(null, PDF_DIGEST));
    }

    @Test
    @DisplayName("Given an active receipt, when it is superseded, then it is no longer active and remembers when")
    void should_not_be_active_when_superseded_given_active_receipt() {
        DonationReceipt receipt = single(Optional.empty());
        Instant later = NOW.plusSeconds(3600);

        receipt.markSuperseded(later);

        assertThat(receipt.isActive()).isFalse();
        assertThat(receipt.supersededAt()).contains(later);
    }

    @Test
    @DisplayName("Given a superseded receipt, when it is superseded again, then it is refused")
    void should_refuse_when_superseded_again_given_superseded_receipt() {
        DonationReceipt receipt = single(Optional.empty());
        receipt.markSuperseded(NOW.plusSeconds(60));

        assertThatIllegalStateException().isThrownBy(() -> receipt.markSuperseded(NOW.plusSeconds(120)));
    }

    @Test
    @DisplayName("Given a receipt, when a fingerprint is compared, then it certifies only the data it was issued for")
    void should_certify_only_own_fingerprint_when_compared_given_receipt() {
        DonationReceipt receipt = single(Optional.empty());

        assertThat(receipt.certifies(new ReceiptFingerprint("a".repeat(64)))).isTrue();
        assertThat(receipt.certifies(OTHER_FINGERPRINT)).isFalse();
    }

    private static DonationReceipt single(Optional<DonationReceiptId> supersedes) {
        return DonationReceipt.issueForDonation(ID, JANA, DONATION, FIRST_NUMBER, TODAY, NOW, LocaleCode.CS, FINGERPRINT, SNAPSHOT_CONTENT, supersedes);
    }

    private static DonationReceipt reconstitute(ReceiptKind kind, Optional<DonationId> donation, Optional<Year> year) {
        return DonationReceipt.reconstitute(ID, JANA, kind, donation, year, FIRST_NUMBER, TODAY, NOW, LocaleCode.CS, FINGERPRINT,
                SNAPSHOT_CONTENT, Optional.empty(), Optional.empty());
    }
}
