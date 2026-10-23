package cz.novanadeje.app.operations.domain.settings;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

public enum Setting {
    PUBLIC_URL(SettingGroup.SITE, SettingFormat.URL, 200, Kind.REQUIRED_IN_SETUP),
    MAIL_HOST(SettingGroup.MAIL, SettingFormat.HOST, 253, Kind.REQUIRED_IN_SETUP),
    MAIL_PORT(SettingGroup.MAIL, SettingFormat.PORT, 5, Kind.REQUIRED_IN_SETUP),
    MAIL_USERNAME(SettingGroup.MAIL, SettingFormat.TEXT, 254, Kind.IN_SETUP),
    MAIL_PASSWORD(SettingGroup.MAIL, SettingFormat.TEXT, 500, Kind.SECRET_IN_SETUP),
    MAIL_AUTH(SettingGroup.MAIL, SettingFormat.BOOLEAN, 5, Kind.IN_SETUP),
    MAIL_STARTTLS(SettingGroup.MAIL, SettingFormat.BOOLEAN, 5, Kind.IN_SETUP),
    MAIL_FROM(SettingGroup.MAIL, SettingFormat.EMAIL, 254, Kind.REQUIRED_IN_SETUP),
    CONTACT_RECIPIENT(SettingGroup.MAIL, SettingFormat.EMAIL, 254, Kind.REQUIRED_IN_SETUP),
    FIO_TOKEN(SettingGroup.BANK, SettingFormat.TEXT, 500, Kind.SECRET_IN_SETUP),
    FIO_HISTORY_FROM(SettingGroup.BANK, SettingFormat.DATE, 10, Kind.ADMINISTRATION_ONLY),
    PAIRING_EXCLUDED_ACCOUNTS(SettingGroup.BANK, SettingFormat.TEXT, 1000, Kind.ADMINISTRATION_ONLY),
    RECEIPT_SIGNATORY_NAME(SettingGroup.RECEIPTS, SettingFormat.TEXT, 200, Kind.ADMINISTRATION_ONLY),
    RECEIPT_SIGNATORY_ROLE(SettingGroup.RECEIPTS, SettingFormat.TEXT, 200, Kind.ADMINISTRATION_ONLY),
    RECEIPT_FIRST_YEAR(SettingGroup.RECEIPTS, SettingFormat.YEAR, 4, Kind.ADMINISTRATION_ONLY),
    ADMIN_EMAILS(SettingGroup.ADMINISTRATORS, SettingFormat.EMAIL_LIST, 1000, Kind.REQUIRED_IN_SETUP_ONLY);

    private static final String PLACEHOLDER_START = "${";

    private final SettingGroup group;
    private final SettingFormat format;
    private final int maxLength;
    private final Kind kind;

    Setting(SettingGroup group, SettingFormat format, int maxLength, Kind kind) {
        this.group = group;
        this.format = format;
        this.maxLength = maxLength;
        this.kind = kind;
    }

    public static List<Setting> secrets() {
        return Arrays.stream(values()).filter(Setting::secret).toList();
    }

    public static List<Setting> requiredInSetup() {
        return Arrays.stream(values()).filter(setting -> setting.kind.requiredInSetup).toList();
    }

    public static List<Setting> inSetup() {
        return Arrays.stream(values()).filter(setting -> setting.kind.inSetup).toList();
    }

    public static List<Setting> inAdministration() {
        return Arrays.stream(values()).filter(setting -> setting.kind.administered).toList();
    }

    public static Optional<Setting> named(String name) {
        return Arrays.stream(values()).filter(setting -> setting.name().equals(name)).findFirst();
    }

    public SettingGroup group() {
        return group;
    }

    public SettingFormat format() {
        return format;
    }

    public int maxLength() {
        return maxLength;
    }

    public boolean secret() {
        return kind.secret;
    }

    public boolean changesOnlyInBrowser() {
        return secret() || this == PUBLIC_URL;
    }

    public boolean decidesWhereMailPasswordGoes() {
        return this == MAIL_HOST || this == MAIL_PORT || this == MAIL_USERNAME || this == MAIL_STARTTLS;
    }

    public boolean isAdministered() {
        return kind.administered;
    }

    public Optional<SettingProblem> check(String value) {
        if (value.length() > maxLength) {
            return Optional.of(SettingProblem.TOO_LONG);
        }
        if (value.contains(PLACEHOLDER_START)) {
            return Optional.of(SettingProblem.PLACEHOLDER);
        }
        if (value.chars().anyMatch(Character::isISOControl)) {
            return Optional.of(SettingProblem.INVALID_TEXT);
        }
        return format.problemWith(value);
    }

    private enum Kind {
        REQUIRED_IN_SETUP(true, true, true, false),
        REQUIRED_IN_SETUP_ONLY(true, true, false, false),
        IN_SETUP(false, true, true, false),
        SECRET_IN_SETUP(false, true, true, true),
        ADMINISTRATION_ONLY(false, false, true, false);

        private final boolean requiredInSetup;
        private final boolean inSetup;
        private final boolean administered;
        private final boolean secret;

        Kind(boolean requiredInSetup, boolean inSetup, boolean administered, boolean secret) {
            this.requiredInSetup = requiredInSetup;
            this.inSetup = inSetup;
            this.administered = administered;
            this.secret = secret;
        }
    }
}
