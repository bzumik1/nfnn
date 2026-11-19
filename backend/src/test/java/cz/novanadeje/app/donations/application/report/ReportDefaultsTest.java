package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReportDefaultsTest {

    @Test
    @DisplayName("Given a configured recipient, when the default settings are asked for, then that recipient gets every section on the 1st")
    void should_send_everything_to_the_configured_recipient_when_asked_given_a_recipient() {
        assertThat(new ReportDefaults("Info@NFNN.cz").settings()).isEqualTo(ReportSettings.defaults(new EmailAddress("info@nfnn.cz")));
    }

    @Test
    @DisplayName("Given a recipient that is not an e-mail address, when the defaults are bound, then they are refused naming REPORT_RECIPIENT and not the value")
    void should_refuse_naming_the_setting_when_bound_given_malformed_recipient() {
        assertThatThrownBy(() -> new ReportDefaults("foundation"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("REPORT_RECIPIENT")
                .hasMessageNotContaining("foundation");
    }

    @Test
    @DisplayName("Given no recipient, when the defaults are bound, then they are refused")
    void should_refuse_when_bound_given_no_recipient() {
        assertThatThrownBy(() -> new ReportDefaults(null)).isInstanceOf(IllegalArgumentException.class);
    }
}
