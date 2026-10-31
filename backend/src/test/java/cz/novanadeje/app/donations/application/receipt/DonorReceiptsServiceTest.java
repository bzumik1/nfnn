package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNotFound;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.ACME;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyReceiptOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DonorReceiptsServiceTest {

    private static final StoredReceiptImage SIGNATURE = new StoredReceiptImage(new byte[] {(byte) 0x89, 'P', 'N', 'G', 1}, "image/png");

    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final ReceiptImageRepository images = mock(ReceiptImageRepository.class);
    private final DonorReceiptsService service = new DonorReceiptsService(receipts, images);

    @Test
    @DisplayName("Given a donor's receipts, when they are listed, then the repository's list comes, newest first as it gives them")
    void should_list_donor_receipts_when_listed_given_stored_receipts() {
        DonationReceipt newer = yearlyReceiptOf(JANA, YEAR_2026);
        DonationReceipt older = yearlyReceiptOf(JANA, YEAR_2026.minusYears(1));
        when(receipts.findByDonorNewestFirst(JANA)).thenReturn(List.of(newer, older));

        assertThat(service.receiptsOf(JANA)).containsExactly(newer, older);
    }

    @Test
    @DisplayName("Given a receipt of the donor, when it is read by its id, then it comes back")
    void should_give_receipt_when_read_given_donor_own_receipt() {
        DonationReceipt receipt = yearlyReceiptOf(JANA, YEAR_2026);
        when(receipts.findById(receipt.id())).thenReturn(Optional.of(receipt));

        assertThat(service.receiptOf(JANA, receipt.id())).isSameAs(receipt);
    }

    @Test
    @DisplayName("Given another donor's receipt or an unknown id, when it is read, then it is not found, never forbidden")
    void should_not_find_when_read_given_other_donor_receipt_or_unknown_id() {
        DonationReceipt acmes = yearlyReceiptOf(ACME, YEAR_2026);
        when(receipts.findById(acmes.id())).thenReturn(Optional.of(acmes));
        DonationReceiptId unknown = DonationReceiptId.newId(NOW);
        when(receipts.findById(unknown)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.receiptOf(JANA, acmes.id())).isInstanceOfSatisfying(ReceiptNotFound.class,
                refused -> assertThat(refused.code()).isEqualTo("donations/receipt-not-found"));
        assertThatThrownBy(() -> service.receiptOf(JANA, unknown)).isInstanceOf(ReceiptNotFound.class);
    }

    @Test
    @DisplayName("Given an image one of the donor's receipts shows, when it is asked for, then its bytes and media type come")
    void should_give_image_when_asked_given_donor_receipt_shows_it() {
        when(receipts.showsSignatureImage(JANA, SIGNATURE.digest())).thenReturn(true);
        when(images.find(SIGNATURE.digest())).thenReturn(Optional.of(SIGNATURE));

        StoredReceiptImage image = service.signatureImageOf(JANA, SIGNATURE.digest());

        assertThat(image.content()).isEqualTo(SIGNATURE.content());
        assertThat(image.mediaType()).isEqualTo("image/png");
    }

    @Test
    @DisplayName("Given an image none of the donor's receipts shows, when it is asked for, then it is not found and the image is not even read")
    void should_not_find_without_reading_image_when_asked_given_no_donor_receipt_shows_it() {
        when(receipts.showsSignatureImage(JANA, SIGNATURE.digest())).thenReturn(false);

        assertThatThrownBy(() -> service.signatureImageOf(JANA, SIGNATURE.digest())).isInstanceOfSatisfying(ReceiptImageNotFound.class,
                refused -> assertThat(refused.code()).isEqualTo("donations/receipt-image-not-found"));
        verifyNoInteractions(images);
    }

    @Test
    @DisplayName("Given an image a receipt names but the store no longer holds, when it is asked for, then it is not found")
    void should_not_find_when_asked_given_image_missing_from_store() {
        ContentDigest missing = new ContentDigest("e".repeat(64));
        when(receipts.showsSignatureImage(JANA, missing)).thenReturn(true);
        when(images.find(missing)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.signatureImageOf(JANA, missing)).isInstanceOf(ReceiptImageNotFound.class);
    }
}
