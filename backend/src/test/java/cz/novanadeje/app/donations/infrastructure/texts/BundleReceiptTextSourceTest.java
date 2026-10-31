package cz.novanadeje.app.donations.infrastructure.texts;

import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.donations.infrastructure.pdf.ReceiptTemplate;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BundleReceiptTextSourceTest {

    private final BundleReceiptTextSource source = new BundleReceiptTextSource();

    @Test
    @DisplayName("Given a Czech receipt, when its texts are asked for, then they are the bundle's Czech receipt texts and no English ones")
    void should_give_czech_texts_only_when_asked_given_czech_receipt() {
        ReceiptTextSet texts = source.textsFor(LocaleCode.CS);

        assertThat(texts.czech()).isEqualTo(ReceiptTemplate.fromClasspath().czech())
                .containsEntry("receipt.title.single", "Potvrzení o přijetí daru");
        assertThat(texts.english()).isEmpty();
    }

    @Test
    @DisplayName("Given an English receipt, when its texts are asked for, then they are the Czech texts and the English ones beneath")
    void should_give_czech_and_english_texts_when_asked_given_english_receipt() {
        ReceiptTextSet texts = source.textsFor(LocaleCode.EN);

        assertThat(texts.czech()).isEqualTo(ReceiptTemplate.fromClasspath().czech());
        assertThat(texts.english()).hasValueSatisfying(english -> assertThat(english).isEqualTo(ReceiptTemplate.fromClasspath().english())
                .containsEntry("receipt.title.single", "Confirmation of a donation received"));
    }

    @Test
    @DisplayName("Given the bundle, when receipt texts are read, then only receipt texts come and never the download file names")
    void should_leave_out_file_names_and_other_texts_when_read_given_bundle() {
        ReceiptTextSet texts = source.textsFor(LocaleCode.EN);

        assertThat(texts.czech().keySet()).allMatch(key -> key.startsWith("receipt.")).noneMatch(key -> key.startsWith("receipt.fileName."));
        assertThat(texts.english().orElseThrow().keySet()).allMatch(key -> key.startsWith("receipt."))
                .noneMatch(key -> key.startsWith("receipt.fileName."));
        assertThat(texts.english().orElseThrow().keySet()).isEqualTo(texts.czech().keySet());
    }
}
