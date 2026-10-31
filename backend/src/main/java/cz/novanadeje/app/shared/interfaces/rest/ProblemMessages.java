package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.domain.LocaleCode;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;

import java.util.Locale;
import java.util.Optional;

public final class ProblemMessages {

    private final MessageSource messages;

    public ProblemMessages(MessageSource messages) {
        this.messages = messages;
    }

    public String text(String key) {
        return text(key, LocaleContextHolder.getLocale());
    }

    public String text(String key, Locale locale) {
        return text(key, locale, key);
    }

    public String text(String key, Locale locale, String fallback) {
        return find(key, locale).orElse(fallback);
    }

    public Optional<String> find(String key) {
        return find(key, LocaleContextHolder.getLocale());
    }

    public Optional<String> find(String key, Locale locale) {
        return Optional.ofNullable(messages.getMessage(key, null, null, locale))
                .or(() -> Optional.ofNullable(messages.getMessage(key, null, null, LocaleCode.CS.toLocale())));
    }
}
