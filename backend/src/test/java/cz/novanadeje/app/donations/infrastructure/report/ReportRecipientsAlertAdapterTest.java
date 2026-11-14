package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReportRecipientsAlertAdapterTest {

    private final ReportSettingsRepository settings = mock(ReportSettingsRepository.class);

    @Test
    @DisplayName("Given the report's recipients, when the alert recipients are asked for, then they are the report's addresses in the report's order")
    void should_answer_with_the_report_recipients_in_order_when_asked_given_report_recipients() {
        ReportSettings current = ReportSettings.defaults(new EmailAddress("info@nfnn.cz"));
        when(settings.current()).thenReturn(new ReportSettings(ReportRecipients.parse(List.of("pavel@example.cz", "info@nfnn.cz", "jakub@example.cz")),
                current.sendDay(), current.sendHour(), current.sections()));

        assertThat(new ReportRecipientsAlertAdapter(settings).emailAddresses()).containsExactly(
                new EmailAddress("pavel@example.cz"), new EmailAddress("info@nfnn.cz"), new EmailAddress("jakub@example.cz"));
    }
}
