package cz.novanadeje.app.operations.domain.settings;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class SettingTest {

    @Test
    @DisplayName("Given well-formed values, when they are checked, then every setting accepts its own")
    void should_accept_value_when_checked_given_well_formed_value() {
        assertThat(Setting.PUBLIC_URL.check("https://nfnn.znamenacek.duckdns.org")).isEmpty();
        assertThat(Setting.MAIL_HOST.check("smtp-relay.brevo.com")).isEmpty();
        assertThat(Setting.MAIL_PORT.check("587")).isEmpty();
        assertThat(Setting.MAIL_AUTH.check("true")).isEmpty();
        assertThat(Setting.MAIL_FROM.check("info@nfnn.cz")).isEmpty();
        assertThat(Setting.ADMIN_EMAILS.check("pavel@example.cz, jakub@example.cz")).isEmpty();
        assertThat(Setting.FIO_HISTORY_FROM.check("2025-01-01")).isEmpty();
        assertThat(Setting.RECEIPT_FIRST_YEAR.check("2026")).isEmpty();
        assertThat(Setting.MAIL_USERNAME.check("Josef Dvořáček")).isEmpty();
        assertThat(Setting.MAIL_PASSWORD.check("xsmtpsib-abc$123")).isEmpty();
    }

    @Test
    @DisplayName("Given malformed values, when they are checked, then each names its problem")
    void should_name_problem_when_checked_given_malformed_value() {
        assertThat(Setting.PUBLIC_URL.check("nfnn.cz")).contains(SettingProblem.INVALID_URL);
        assertThat(Setting.PUBLIC_URL.check("https://nfnn.cz/?a=1")).contains(SettingProblem.INVALID_URL);
        assertThat(Setting.MAIL_HOST.check("smtp relay")).contains(SettingProblem.INVALID_HOST);
        assertThat(Setting.MAIL_PORT.check("0")).contains(SettingProblem.INVALID_PORT);
        assertThat(Setting.MAIL_PORT.check("smtp")).contains(SettingProblem.INVALID_PORT);
        assertThat(Setting.MAIL_STARTTLS.check("yes")).contains(SettingProblem.INVALID_BOOLEAN);
        assertThat(Setting.CONTACT_RECIPIENT.check("info")).contains(SettingProblem.INVALID_EMAIL);
        assertThat(Setting.ADMIN_EMAILS.check("pavel@example.cz, nobody")).contains(SettingProblem.INVALID_EMAIL_LIST);
        assertThat(Setting.FIO_HISTORY_FROM.check("1. 1. 2025")).contains(SettingProblem.INVALID_DATE);
        assertThat(Setting.RECEIPT_FIRST_YEAR.check("26")).contains(SettingProblem.INVALID_YEAR);
    }

    @Test
    @DisplayName("Given remembered sign-in lengths, when they are checked, then only whole days from 1 to 30 are accepted")
    void should_accept_only_one_to_thirty_days_when_checked_given_remembered_sign_in_length() {
        assertThat(Setting.SESSION_REMEMBER_DAYS.check("1")).isEmpty();
        assertThat(Setting.SESSION_REMEMBER_DAYS.check("30")).isEmpty();
        assertThat(Setting.SESSION_REMEMBER_DAYS.check("0")).contains(SettingProblem.INVALID_DAYS);
        assertThat(Setting.SESSION_REMEMBER_DAYS.check("31")).contains(SettingProblem.INVALID_DAYS);
        assertThat(Setting.SESSION_REMEMBER_DAYS.check("1x")).contains(SettingProblem.INVALID_DAYS);
        assertThat(Setting.SESSION_REMEMBER_DAYS.changesOnlyInBrowser()).isFalse();
    }

    @Test
    @DisplayName("Given the settings, when it is asked which change only in a browser, then the secrets, the site's address and every setting that decides where mail goes or whom it seems to come from do, and the rest do not")
    void should_keep_secrets_the_address_and_every_mail_setting_to_the_browser_when_asked() {
        assertThat(Arrays.stream(Setting.values()).filter(Setting::changesOnlyInBrowser)).containsExactlyInAnyOrder(
                Setting.PUBLIC_URL, Setting.MAIL_HOST, Setting.MAIL_PORT, Setting.MAIL_USERNAME, Setting.MAIL_PASSWORD, Setting.MAIL_AUTH,
                Setting.MAIL_STARTTLS, Setting.MAIL_FROM, Setting.CONTACT_RECIPIENT, Setting.FIO_TOKEN);
    }

    @Test
    @DisplayName("Given a placeholder, a line break or an overlong value, when it is checked, then it is refused for any setting")
    void should_refuse_value_when_checked_given_placeholder_control_character_or_length() {
        assertThat(Setting.MAIL_USERNAME.check("${JWT_SECRET}")).contains(SettingProblem.PLACEHOLDER);
        assertThat(Setting.MAIL_PASSWORD.check("abc${x}")).contains(SettingProblem.PLACEHOLDER);
        assertThat(Setting.FIO_TOKEN.check("abc\ndef")).contains(SettingProblem.INVALID_TEXT);
        assertThat(Setting.PAIRING_EXCLUDED_ACCOUNTS.check("x".repeat(Setting.PAIRING_EXCLUDED_ACCOUNTS.maxLength() + 1)))
                .contains(SettingProblem.TOO_LONG);
    }

    @Test
    @DisplayName("Given the backup key filled in by a password manager, when it is checked as a password or a token, then it is refused, so it never reaches the mail server or the bank")
    void should_refuse_backup_key_when_checked_as_secret() {
        String key = "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH";

        assertThat(Setting.MAIL_PASSWORD.check(key)).contains(SettingProblem.BACKUP_KEY);
        assertThat(Setting.FIO_TOKEN.check(" " + key.toLowerCase())).contains(SettingProblem.BACKUP_KEY);
        assertThat(Setting.MAIL_PASSWORD.check("xsmtpsib-0123456789abcdef")).isEmpty();
    }

    @Test
    @DisplayName("Given the catalogue, when it is read, then the passwords and tokens are the secret settings")
    void should_mark_secrets_when_read_given_catalogue() {
        assertThat(Setting.secrets()).containsExactlyInAnyOrder(Setting.MAIL_PASSWORD, Setting.FIO_TOKEN);
    }

    @Test
    @DisplayName("Given the catalogue, when the wizard asks, then the site address, mail and the first administrator are required")
    void should_require_essentials_when_wizard_asks_given_catalogue() {
        assertThat(Setting.requiredInSetup()).containsExactlyInAnyOrder(Setting.PUBLIC_URL, Setting.MAIL_HOST, Setting.MAIL_PORT,
                Setting.MAIL_FROM, Setting.CONTACT_RECIPIENT, Setting.ADMIN_EMAILS);
    }
}
