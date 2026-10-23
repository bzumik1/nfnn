package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.donations.domain.report.SentReport;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportSettingsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T08:00:00Z");
    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final ReportSettings DEFAULTS = ReportSettings.defaults(new EmailAddress("info@nfnn.cz"));
    private static final ReportSettings CHANGED = new ReportSettings(ReportRecipients.parse(List.of("pavel@example.cz", "jakub@example.cz")), 5, 9,
            new ReportSections(true, true, false, true));

    private final ReportSettingsRepository settings = mock(ReportSettingsRepository.class);
    private final MonthlyReportLog reportLog = mock(MonthlyReportLog.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private final ReportSettingsService service = new ReportSettingsService(settings, reportLog, events, clock);

    @BeforeEach
    void stubDefaults() {
        when(settings.current()).thenReturn(DEFAULTS);
        when(settings.lastChangedAt()).thenReturn(Optional.empty());
        when(reportLog.sentReportsNewestFirst()).thenReturn(List.of());
    }

    @Test
    @DisplayName("Given nothing saved and no report sent, when the view is asked for, then it shows the defaults and September due on the 1st of October")
    void should_show_defaults_and_overdue_september_when_viewed_given_nothing_saved() {
        ReportAdministrationView view = service.view();

        assertThat(view.settings()).isEqualTo(DEFAULTS);
        assertThat(view.changedAt()).isEmpty();
        assertThat(view.sentReports()).isEmpty();
        assertThat(view.nextReport()).isEqualTo(new ReportAdministrationView.NextReport(ReportMonth.of(2026, 9), LocalDate.of(2026, 10, 1)));
        assertThat(view.lastEndedMonth()).isEqualTo(ReportMonth.of(2026, 9));
    }

    @Test
    @DisplayName("Given September sent and the 5th as the send day, when the view is asked for, then October is next, due on the 5th of November")
    void should_show_next_month_when_viewed_given_previous_month_sent() {
        when(settings.current()).thenReturn(CHANGED);
        when(settings.lastChangedAt()).thenReturn(Optional.of(NOW.minusSeconds(3600)));
        SentReport september = new SentReport(ReportMonth.of(2026, 9), Instant.parse("2026-10-05T05:00:00Z"));
        when(reportLog.sentReportsNewestFirst()).thenReturn(List.of(september));

        ReportAdministrationView view = service.view();

        assertThat(view.settings()).isEqualTo(CHANGED);
        assertThat(view.changedAt()).contains(NOW.minusSeconds(3600));
        assertThat(view.sentReports()).containsExactly(september);
        assertThat(view.nextReport()).isEqualTo(new ReportAdministrationView.NextReport(ReportMonth.of(2026, 10), LocalDate.of(2026, 11, 5)));
    }

    @Test
    @DisplayName("Given an administrator, when the settings are changed, then they are saved with the time and the change is audited with its content")
    void should_save_and_audit_when_changed_given_administrator() {
        ReportSettings saved = service.change(ADMIN, CHANGED);

        assertThat(saved).isEqualTo(CHANGED);
        verify(settings).save(CHANGED, NOW);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audited.getValue().action()).isEqualTo("CHANGE_REPORT_SETTINGS");
        assertThat(audited.getValue().subjectId()).isEmpty();
        assertThat(audited.getValue().details()).isEqualTo("Nastavení měsíčního přehledu změněno: příjemci pavel@example.cz, jakub@example.cz;"
                + " odesílá se 5. den v měsíci v 9:00; části dárci, dary, stahování z banky");
        assertThat(audited.getValue().performedAt()).isEqualTo(NOW);
    }
}
