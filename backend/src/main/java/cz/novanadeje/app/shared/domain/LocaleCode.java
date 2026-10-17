package cz.novanadeje.app.shared.domain;

import java.util.Locale;

public enum LocaleCode {
    CS("cs"),
    EN("en");

    private final String tag;

    LocaleCode(String tag) {
        this.tag = tag;
    }

    public String tag() {
        return tag;
    }

    public Locale toLocale() {
        return Locale.forLanguageTag(tag);
    }

    public static LocaleCode fromTag(String tag) {
        if (tag == null || tag.isBlank()) {
            return CS;
        }
        for (LocaleCode code : values()) {
            if (code.tag.equalsIgnoreCase(tag.trim())) {
                return code;
            }
        }
        throw new IllegalArgumentException("Unsupported locale: " + tag);
    }
}
