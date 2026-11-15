package cz.novanadeje.app.support;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class ArabicDigitsDefaultLocaleTest {

    private static final Locale GENERAL = Locale.forLanguageTag("en-US");
    private static final Locale FORMAT = Locale.forLanguageTag("de-DE");
    private static final Locale DISPLAY = Locale.forLanguageTag("en-GB");

    private Locale before;
    private Locale beforeFormat;
    private Locale beforeDisplay;

    @BeforeEach
    void rememberAndSetDistinctCategories() {
        before = Locale.getDefault();
        beforeFormat = Locale.getDefault(Locale.Category.FORMAT);
        beforeDisplay = Locale.getDefault(Locale.Category.DISPLAY);
        Locale.setDefault(GENERAL);
        Locale.setDefault(Locale.Category.FORMAT, FORMAT);
        Locale.setDefault(Locale.Category.DISPLAY, DISPLAY);
    }

    @AfterEach
    void restore() {
        Locale.setDefault(before);
        Locale.setDefault(Locale.Category.FORMAT, beforeFormat);
        Locale.setDefault(Locale.Category.DISPLAY, beforeDisplay);
    }

    @Test
    @DisplayName("Given defaults whose format and display categories differ from the general one, when a test runs under the extension and ends, then the test saw Arabic-Indic digits and each default is the earlier one again")
    void should_restore_each_default_when_ended_given_categories_that_differ() {
        ArabicDigitsDefaultLocale extension = new ArabicDigitsDefaultLocale();

        extension.beforeEach(null);
        String digits = String.format("%d", 7);
        extension.afterEach(null);

        assertThat(digits).isEqualTo("٧");
        assertThat(Locale.getDefault()).isEqualTo(GENERAL);
        assertThat(Locale.getDefault(Locale.Category.FORMAT)).isEqualTo(FORMAT);
        assertThat(Locale.getDefault(Locale.Category.DISPLAY)).isEqualTo(DISPLAY);
    }
}
