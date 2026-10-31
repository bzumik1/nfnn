package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryMissing;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import cz.novanadeje.app.shared.application.people.FoundationPeople;
import cz.novanadeje.app.shared.application.people.FoundationPerson;
import cz.novanadeje.app.shared.application.people.PrintPortrait;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class IssuingSignatoryTest {

    private static final Instant NOW = Instant.parse("2027-01-15T10:00:00Z");
    private static final PersonReference PETR = new PersonReference(UUID.fromString("019a3a00-0000-7000-8000-0000000000a1"));
    private static final ReceiptSignatory CHOSEN = new ReceiptSignatory(PETR, " předseda správní rady ", NOW.minusSeconds(3600));
    private static final ContentDigest SIGNATURE = new ContentDigest("a".repeat(64));
    private static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 1, 2, 3};

    private final ReceiptSignatoryRepository signatories = mock(ReceiptSignatoryRepository.class);
    private final ReceiptSignatureRepository signatures = mock(ReceiptSignatureRepository.class);
    private final ReceiptImageRepository images = mock(ReceiptImageRepository.class);
    private final FoundationPeople people = mock(FoundationPeople.class);
    private final IssuingSignatory issuing = new IssuingSignatory(signatories, signatures, images, people);

    @Test
    @DisplayName("Given a chosen signatory with a receipt signature and a portrait, when a receipt is issued, then it prints their name and receipt role, names the signature's digest and stores the print portrait as a JPEG receipt image by its digest")
    void should_resolve_name_role_signature_and_portrait_when_issued_given_full_signatory() {
        when(signatories.current()).thenReturn(Optional.of(CHOSEN));
        when(people.find(PETR.value())).thenReturn(Optional.of(new FoundationPerson(PETR.value(), "Petr Vzorový", true)));
        when(signatures.digestOf(PETR)).thenReturn(Optional.of(SIGNATURE));
        when(people.printPortraitOf(PETR.value())).thenReturn(Optional.of(new PrintPortrait(JPEG, PrintPortrait.SIDE)));

        SignatoryAtIssue resolved = issuing.resolve(NOW);

        assertThat(resolved.signatory()).isEqualTo(new Signatory("Petr Vzorový", "předseda správní rady"));
        assertThat(resolved.signatureImage()).contains(SIGNATURE);
        assertThat(resolved.portraitImage()).contains(ContentDigest.of(JPEG));
        ArgumentCaptor<StoredReceiptImage> stored = ArgumentCaptor.forClass(StoredReceiptImage.class);
        verify(images).storeIfAbsent(stored.capture(), eq(NOW));
        assertThat(stored.getValue().mediaType()).isEqualTo("image/jpeg");
        assertThat(stored.getValue().content()).isEqualTo(JPEG);
    }

    @Test
    @DisplayName("Given a chosen signatory without a receipt signature or a portrait, when a receipt is issued, then it names neither image and stores nothing")
    void should_resolve_without_images_when_issued_given_signatory_without_images() {
        when(signatories.current()).thenReturn(Optional.of(CHOSEN));
        when(people.find(PETR.value())).thenReturn(Optional.of(new FoundationPerson(PETR.value(), "Petr Vzorový", false)));
        when(signatures.digestOf(PETR)).thenReturn(Optional.empty());
        when(people.printPortraitOf(PETR.value())).thenReturn(Optional.empty());

        SignatoryAtIssue resolved = issuing.resolve(NOW);

        assertThat(resolved.signatureImage()).isEmpty();
        assertThat(resolved.portraitImage()).isEmpty();
        verify(images, never()).storeIfAbsent(any(), any());
    }

    @Test
    @DisplayName("Given nobody chosen, or a chosen person who is no longer among the people of the foundation, when a receipt is issued, then it is refused as missing a signatory")
    void should_refuse_when_issued_given_no_signatory() {
        when(signatories.current()).thenReturn(Optional.empty());

        assertThatThrownBy(() -> issuing.resolve(NOW)).isInstanceOf(ReceiptSignatoryMissing.class)
                .hasFieldOrPropertyWithValue("code", "donations/receipt-signatory-missing");

        when(signatories.current()).thenReturn(Optional.of(CHOSEN));
        when(people.find(PETR.value())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> issuing.resolve(NOW)).isInstanceOf(ReceiptSignatoryMissing.class);
        verify(images, never()).storeIfAbsent(any(), any());
    }
}
