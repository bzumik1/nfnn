package cz.novanadeje.app.operations.domain.settings;

import java.util.Locale;

public enum SettingProblem {
    REQUIRED,
    TOO_LONG,
    INVALID_TEXT,
    PLACEHOLDER,
    INVALID_URL,
    INVALID_HOST,
    INVALID_PORT,
    INVALID_BOOLEAN,
    INVALID_EMAIL,
    INVALID_EMAIL_LIST,
    INVALID_DATE,
    INVALID_YEAR,
    REJECTED_AT_STARTUP;

    public String code() {
        return name().toLowerCase(Locale.ROOT).replace('_', '-');
    }
}
