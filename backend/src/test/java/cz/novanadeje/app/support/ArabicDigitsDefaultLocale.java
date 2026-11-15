package cz.novanadeje.app.support;

import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

import java.util.Locale;

public final class ArabicDigitsDefaultLocale implements BeforeEachCallback, AfterEachCallback {

    public static final Locale ARABIC_EGYPT = Locale.forLanguageTag("ar-EG");

    private Locale previous;
    private Locale previousFormat;
    private Locale previousDisplay;

    @Override
    public void beforeEach(ExtensionContext context) {
        previous = Locale.getDefault();
        previousFormat = Locale.getDefault(Locale.Category.FORMAT);
        previousDisplay = Locale.getDefault(Locale.Category.DISPLAY);
        Locale.setDefault(ARABIC_EGYPT);
        if (String.format("%d", 7).equals("7")) {
            throw new IllegalStateException("The JDK no longer writes Arabic-Indic digits for " + ARABIC_EGYPT.toLanguageTag()
                    + ", so a test under this locale would prove nothing");
        }
    }

    @Override
    public void afterEach(ExtensionContext context) {
        Locale.setDefault(previous);
        Locale.setDefault(Locale.Category.FORMAT, previousFormat);
        Locale.setDefault(Locale.Category.DISPLAY, previousDisplay);
    }
}
