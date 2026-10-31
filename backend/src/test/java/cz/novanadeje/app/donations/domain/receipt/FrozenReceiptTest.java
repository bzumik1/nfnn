package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofMessage;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.BILINGUAL_TEXTS;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.CZECH_TEXTS;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.KEY_ID;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.janaSpeakingEnglish;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.verificationOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class FrozenReceiptTest {

    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);

    @Test
    @DisplayName("Given a Czech receipt, when it is frozen with the Czech texts only, then it keeps them in schema version 1")
    void should_keep_czech_texts_in_schema_version_one_when_frozen_given_czech_receipt() {
        FrozenReceipt frozen = new FrozenReceipt(singleDocument(jana(), MARCH), CZECH_TEXTS, Optional.empty(), Optional.empty(), verificationOf(FIRST_NUMBER));

        assertThat(frozen.schemaVersion()).isEqualTo(1);
        assertThat(frozen.texts().czech()).containsEntry("receipt.title.single", "Potvrzení o přijetí daru");
        assertThat(frozen.texts().english()).isEmpty();
    }

    @Test
    @DisplayName("Given a receipt, when its texts do not match its locale, then freezing it is refused")
    void should_refuse_when_frozen_given_texts_not_matching_locale() {
        assertThatIllegalArgumentException().isThrownBy(() -> new FrozenReceipt(singleDocument(jana(), MARCH), BILINGUAL_TEXTS, Optional.empty(), Optional.empty(),
                verificationOf(FIRST_NUMBER)));
        assertThatIllegalArgumentException().isThrownBy(() -> new FrozenReceipt(singleDocument(janaSpeakingEnglish(), MARCH), CZECH_TEXTS,
                Optional.empty(), Optional.empty(), verificationOf(FIRST_NUMBER)));
        assertThat(new FrozenReceipt(singleDocument(janaSpeakingEnglish(), MARCH), BILINGUAL_TEXTS, Optional.empty(), Optional.empty(), verificationOf(FIRST_NUMBER))
                .document().locale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given texts that are empty, blank or not receipt texts, when they are frozen, then they are refused")
    void should_refuse_when_frozen_given_texts_empty_blank_or_foreign() {
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptTextSet.czechOnly(Map.of()));
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptTextSet.czechOnly(Map.of("receipt.title.single", " ")));
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptTextSet.czechOnly(Map.of("problem.validation.title", "Neplatné údaje")));
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptTextSet.bilingual(Map.of("receipt.title.single", "Potvrzení"), Map.of()));
    }

    @Test
    @DisplayName("Given frozen texts, when the map they came from changes, then the frozen texts stay as they were")
    void should_stay_unchanged_when_source_map_changes_given_frozen_texts() {
        TreeMap<String, String> source = new TreeMap<>(Map.of("receipt.title.single", "Potvrzení o přijetí daru"));
        ReceiptTextSet texts = ReceiptTextSet.czechOnly(source);

        source.put("receipt.title.single", "Jiný titulek");

        assertThat(texts.czech()).containsEntry("receipt.title.single", "Potvrzení o přijetí daru");
    }

    @Test
    @DisplayName("Given a proof, when its verification is read, then the QR text is the proof's text and the status digest is the SHA-256 of the signed message followed by the signature")
    void should_give_qr_text_and_status_digest_of_signed_message_and_signature_when_read_given_proof() {
        ReceiptProof proof = verificationOf(FIRST_NUMBER).proof();
        ReceiptVerification verification = new ReceiptVerification(KEY_ID, proof);
        byte[] message = ReceiptProofMessage.of("27278794", proof.body());
        byte[] signed = Arrays.copyOf(message, message.length + ReceiptProof.SIGNATURE_BYTES);
        System.arraycopy(proof.signature(), 0, signed, message.length, ReceiptProof.SIGNATURE_BYTES);

        assertThat(verification.qrText()).isEqualTo(proof.text()).startsWith("https://nfnn.cz/overit#1");
        assertThat(verification.statusDigest("27278794")).isEqualTo(ContentDigest.of(signed));
        assertThat(verification.statusDigest("27278794")).isNotEqualTo(ContentDigest.of(message)).isNotEqualTo(ContentDigest.of(proof.bytes()));
        assertThat(verification.statusDigest("12345678")).isNotEqualTo(verification.statusDigest("27278794"));
    }

    @Test
    @DisplayName("Given a frozen receipt, when its status digest is read, then it is its verification's digest under the frozen foundation's IČO")
    void should_digest_under_frozen_foundation_when_status_digest_read_given_frozen_receipt() {
        FrozenReceipt frozen = new FrozenReceipt(singleDocument(jana(), MARCH), CZECH_TEXTS, Optional.empty(), Optional.empty(), verificationOf(FIRST_NUMBER));

        assertThat(frozen.statusDigest()).isEqualTo(frozen.verification().statusDigest(frozen.document().foundation().companyIdentifier()));
    }
}
