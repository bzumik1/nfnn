package cz.novanadeje.app.donations.infrastructure.texts;

import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PrintableText;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BundleReceiptTextSourceTest {

    private final BundleReceiptTextSource source = new BundleReceiptTextSource();

    @Test
    @DisplayName("Given a Czech receipt, when its texts are asked for, then they are the bundle's Czech receipt texts and no English ones")
    void should_give_czech_texts_only_when_asked_given_czech_receipt() {
        ReceiptTextSet texts = source.textsFor(LocaleCode.CS);

        assertThat(texts.czech()).isEqualTo(source.textsFor(LocaleCode.EN).czech())
                .containsEntry("receipt.title.single", "Potvrzení o přijetí daru");
        assertThat(texts.english()).isEmpty();
    }

    @Test
    @DisplayName("Given an English receipt, when its texts are asked for, then they are the Czech texts and the English ones beneath")
    void should_give_czech_and_english_texts_when_asked_given_english_receipt() {
        ReceiptTextSet texts = source.textsFor(LocaleCode.EN);

        assertThat(texts.czech()).containsEntry("receipt.title.single", "Potvrzení o přijetí daru");
        assertThat(texts.english()).hasValueSatisfying(english -> assertThat(english)
                .containsEntry("receipt.title.single", "Confirmation of a donation received"));
    }

    @Test
    @DisplayName("Given the bundle, when receipt texts are read, then only receipt texts come, the same keys in Czech and in English")
    void should_give_only_receipt_texts_with_the_same_keys_when_read_given_bundle() {
        ReceiptTextSet texts = source.textsFor(LocaleCode.EN);

        assertThat(texts.czech().keySet()).allMatch(key -> key.startsWith("receipt."));
        assertThat(texts.english().orElseThrow().keySet()).isEqualTo(texts.czech().keySet());
    }

    @Test
    @DisplayName("Given the bundle, when receipt texts are read, then they carry the caption beside the verification QR code and the images' alternative texts, so a receipt freezes them")
    void should_carry_the_verification_caption_and_alternative_texts_when_read_given_bundle() {
        ReceiptTextSet texts = source.textsFor(LocaleCode.EN);

        assertThat(texts.czech())
                .containsEntry("receipt.verification.heading", "Ověření potvrzení")
                .containsEntry("receipt.verification.text", "Načtěte kód telefonem a uvidíte, co fond podepsal.")
                .containsEntry("receipt.verification.alt", "QR kód pro ověření potvrzení na nfnn.cz/overit")
                .containsEntry("receipt.signature.alt", "Podpis")
                .containsEntry("receipt.portrait.alt", "Fotografie podepisujícího");
        assertThat(texts.english().orElseThrow())
                .containsEntry("receipt.verification.heading", "Verification")
                .containsEntry("receipt.verification.text", "Scan the code with a phone to see what the foundation signed.");
    }

    @Test
    @DisplayName("Given the bundle, when the Czech and English receipt texts are read, then every one of them prints as it is")
    void should_print_every_text_as_it_is_when_read_given_bundle() {
        ReceiptTextSet texts = source.textsFor(LocaleCode.EN);

        assertThat(texts.czech().values()).allSatisfy(text -> assertThat(PrintableText.of(text)).isEqualTo(new PrintableText(text, List.of())));
        assertThat(texts.english().orElseThrow().values())
                .allSatisfy(text -> assertThat(PrintableText.of(text)).isEqualTo(new PrintableText(text, List.of())));
    }
}
