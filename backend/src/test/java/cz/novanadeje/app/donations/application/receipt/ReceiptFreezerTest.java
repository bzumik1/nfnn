package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.application.signing.ReceiptProofs;
import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptTooLong;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedReceipt;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.BILINGUAL_TEXTS;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.CZECH_TEXTS;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.KEY_ID;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.janaSpeakingEnglish;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.verificationOf;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyDocument;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReceiptFreezerTest {

    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final ContentDigest SIGNATURE = new ContentDigest("5".repeat(64));

    private final ReceiptTextSource texts = mock(ReceiptTextSource.class);
    private final ReceiptProofs proofs = mock(ReceiptProofs.class);
    private final ReceiptSigner signer = mock(ReceiptSigner.class);
    private final ReceiptFreezer freezer = new ReceiptFreezer(texts, proofs, signer);

    @Test
    @DisplayName("Given a Czech document and a signature image, when it is frozen, then it keeps the document, the Czech texts, the image digest and the proof of the signed receipt under the server's key")
    void should_keep_document_texts_image_and_proof_when_frozen_given_czech_document() {
        ReceiptDocument document = singleDocument(jana(), MARCH);
        ReceiptProof proof = verificationOf(FIRST_NUMBER).proof();
        when(texts.textsFor(LocaleCode.CS)).thenReturn(CZECH_TEXTS);
        when(signer.keyId()).thenReturn(KEY_ID);
        when(proofs.prove(SignedReceipt.of(document))).thenReturn(proof);

        FrozenReceipt frozen = freezer.freeze(document, Optional.of(SIGNATURE));

        assertThat(frozen.document()).isEqualTo(document);
        assertThat(frozen.texts()).isEqualTo(CZECH_TEXTS);
        assertThat(frozen.signatureImage()).contains(SIGNATURE);
        assertThat(frozen.verification().keyId()).isEqualTo(KEY_ID);
        assertThat(frozen.verification().proof()).isEqualTo(proof);
    }

    @Test
    @DisplayName("Given an English yearly document without a signature image, when it is frozen, then it keeps both languages' texts and no image")
    void should_keep_both_languages_and_no_image_when_frozen_given_english_document_without_signature() {
        ReceiptDocument document = yearlyDocument(janaSpeakingEnglish(), List.of(MARCH));
        when(texts.textsFor(LocaleCode.EN)).thenReturn(BILINGUAL_TEXTS);
        when(signer.keyId()).thenReturn(KEY_ID);
        when(proofs.prove(SignedReceipt.of(document))).thenReturn(verificationOf(FIRST_NUMBER).proof());

        FrozenReceipt frozen = freezer.freeze(document, Optional.empty());

        assertThat(frozen.texts()).isEqualTo(BILINGUAL_TEXTS);
        assertThat(frozen.signatureImage()).isEmpty();
    }

    @Test
    @DisplayName("Given a receipt whose proof does not fit a QR code, when it is frozen, then the refusal propagates")
    void should_refuse_when_frozen_given_proof_too_long() {
        ReceiptDocument document = singleDocument(jana(), MARCH);
        when(texts.textsFor(LocaleCode.CS)).thenReturn(CZECH_TEXTS);
        when(signer.keyId()).thenReturn(KEY_ID);
        when(proofs.prove(SignedReceipt.of(document))).thenThrow(new ReceiptTooLong());

        assertThatThrownBy(() -> freezer.freeze(document, Optional.empty())).isInstanceOf(ReceiptTooLong.class);
    }
}
