package cz.novanadeje.app.operations.domain.settings;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SettingChangeTest {

    @Test
    @DisplayName("Given surrounding spaces, when a change is made, then the value is trimmed")
    void should_trim_value_when_made_given_spaces() {
        assertThat(new SettingChange(Setting.MAIL_HOST, "  smtp-relay.brevo.com ").value()).isEqualTo("smtp-relay.brevo.com");
    }

    @Test
    @DisplayName("Given no value or only spaces, when a change is made, then it returns the setting to its default")
    void should_reset_when_made_given_blank_value() {
        assertThat(new SettingChange(Setting.FIO_TOKEN, null).resetsToDefault()).isTrue();
        assertThat(new SettingChange(Setting.FIO_TOKEN, "   ").resetsToDefault()).isTrue();
        assertThat(new SettingChange(Setting.FIO_TOKEN, "token").resetsToDefault()).isFalse();
    }

    @Test
    @DisplayName("Given a secret value, when the change is printed, then the value is masked")
    void should_mask_value_when_printed_given_secret() {
        assertThat(new SettingChange(Setting.MAIL_PASSWORD, "very-secret").toString()).doesNotContain("very-secret");
        assertThat(new SettingChange(Setting.MAIL_HOST, "smtp.example.cz").toString()).contains("smtp.example.cz");
    }
}
