package cz.novanadeje.app.donations.infrastructure.pdf;

import java.text.MessageFormat;
import java.util.Locale;
import java.util.Map;

public final class ReceiptTexts {

    private final Map<String, String> texts;
    private final Locale locale;

    ReceiptTexts(Map<String, String> texts, Locale locale) {
        this.texts = Map.copyOf(texts);
        this.locale = locale;
    }

    public String text(String key, Object... arguments) {
        String text = texts.get(key);
        if (text == null) {
            throw new IllegalStateException("The receipt template has no " + locale.toLanguageTag() + " text " + key);
        }
        return arguments.length == 0 ? text : new MessageFormat(text, locale).format(arguments);
    }
}
