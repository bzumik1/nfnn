package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;

final class SettingProperties {

    private static final Map<Setting, String> RUNNING = new EnumMap<>(Map.ofEntries(
            Map.entry(Setting.PUBLIC_URL, "app.site.public-url"),
            Map.entry(Setting.MAIL_HOST, "spring.mail.host"),
            Map.entry(Setting.MAIL_PORT, "spring.mail.port"),
            Map.entry(Setting.MAIL_USERNAME, "spring.mail.username"),
            Map.entry(Setting.MAIL_PASSWORD, "spring.mail.password"),
            Map.entry(Setting.MAIL_AUTH, "spring.mail.properties.mail.smtp.auth"),
            Map.entry(Setting.MAIL_STARTTLS, "spring.mail.properties.mail.smtp.starttls.enable"),
            Map.entry(Setting.MAIL_FROM, "app.mail.sender-email"),
            Map.entry(Setting.CONTACT_RECIPIENT, "app.contact.recipient-email"),
            Map.entry(Setting.FIO_TOKEN, "app.donations.fio.token"),
            Map.entry(Setting.FIO_HISTORY_FROM, "app.donations.import.history-from"),
            Map.entry(Setting.PAIRING_EXCLUDED_ACCOUNTS, "app.donations.pairing.excluded-accounts"),
            Map.entry(Setting.RECEIPT_SIGNATORY_NAME, "app.donations.receipt.signatory-name"),
            Map.entry(Setting.RECEIPT_SIGNATORY_ROLE, "app.donations.receipt.signatory-role"),
            Map.entry(Setting.RECEIPT_FIRST_YEAR, "app.donations.receipt.first-year"),
            Map.entry(Setting.ADMIN_EMAILS, "app.donors.administrators.emails"),
            Map.entry(Setting.TUNNEL_TOKEN, "TUNNEL_TOKEN")));

    private SettingProperties() {
    }

    static String runningProperty(Setting setting) {
        return Optional.ofNullable(RUNNING.get(setting)).orElseThrow(() -> new IllegalStateException("No property for " + setting));
    }
}
