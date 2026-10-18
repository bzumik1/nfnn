package cz.novanadeje.app.donations.infrastructure.pdf;

import org.springframework.context.MessageSource;

import java.util.Locale;

public final class ReceiptTexts {

    private final MessageSource messages;
    private final Locale locale;

    ReceiptTexts(MessageSource messages, Locale locale) {
        this.messages = messages;
        this.locale = locale;
    }

    public String text(String key, Object... arguments) {
        return messages.getMessage(key, arguments.length == 0 ? null : arguments, locale);
    }
}
