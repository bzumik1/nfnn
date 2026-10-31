package cz.novanadeje.app.operations.domain.settings;

import java.util.Locale;

public enum SettingProblem {
    REQUIRED,
    TOO_LONG,
    INVALID_TEXT,
    PLACEHOLDER,
    BACKUP_KEY,
    INVALID_URL,
    INVALID_HOST,
    INVALID_PORT,
    INVALID_BOOLEAN,
    INVALID_EMAIL,
    INVALID_EMAIL_LIST,
    INVALID_DATE,
    INVALID_YEAR,
    REJECTED_AT_STARTUP,
    PASSWORD_FOR_NEW_MAIL_SERVER,
    NOT_IN_SETUP,
    NOT_IN_ADMINISTRATION,
    UNKNOWN_SETTING;

    public String code() {
        return name().toLowerCase(Locale.ROOT).replace('_', '-');
    }
}
