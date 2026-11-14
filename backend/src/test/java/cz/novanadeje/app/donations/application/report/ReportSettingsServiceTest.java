package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
import cz.novanadeje.app.donations.application.admincopy.AdminDonationsRows;
import cz.novanadeje.app.donations.application.admincopy.AdminSyncRows.ReportSettingsRow;
import cz.novanadeje.app.donations.domain.ChangedMeanwhile;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.report.NextReport;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.shared.infrastructure.json.RowVersionsFixture;
import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportRecipientsInBrowserOnly;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
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
    private final ReportSettingsService service = new ReportSettingsService(settings, reportLog, events,
            new AdminDonationsRows(RowVersionsFixture.canonical(), mock(DonationRepository.class), mock(DonorRecordRepository.class)), clock);

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
        assertThat(view.nextReport()).isEqualTo(new NextReport(ReportMonth.of(2026, 9), LocalDate.of(2026, 10, 1)));
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
        assertThat(view.nextReport()).isEqualTo(new NextReport(ReportMonth.of(2026, 10), LocalDate.of(2026, 11, 5)));
    }

    @Test
    @DisplayName("Given an administrator, when the settings are changed, then they are saved with the time and the change is audited with its content")
    void should_save_and_audit_when_changed_given_administrator() {
        SavedReportSettings saved = service.change(ADMIN, AdministrationChannel.BROWSER, CHANGED, ExpectedVersion.none());

        assertThat(saved.settings()).isEqualTo(CHANGED);
        assertThat(saved.changedAt()).isEqualTo(NOW);
        verify(settings).save(CHANGED, NOW);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audited.getValue().action()).isEqualTo("CHANGE_REPORT_SETTINGS");
        assertThat(audited.getValue().subjectId()).isEmpty();
        assertThat(audited.getValue().details()).isEqualTo("Nastavení měsíčního přehledu změněno: počet příjemců 2;"
                + " odesílá se 5. den v měsíci v 9:00; části dárci, dary, stahování z banky");
        assertThat(audited.getValue().performedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a connected application, when it changes the recipients, then it is refused as donations/report-recipients-in-browser-only and nothing is saved or audited")
    void should_refuse_when_changed_given_a_connected_application_changing_the_recipients() {
        for (List<String> recipients : List.of(List.of("info@nfnn.cz", "x@evil.example"), List.of("x@evil.example"))) {
            ReportSettings changed = new ReportSettings(ReportRecipients.parse(recipients), 1, 7, new ReportSections(true, true, true, true));

            assertThatThrownBy(() -> service.change(ADMIN, AdministrationChannel.CONNECTED_APPLICATION, changed, ExpectedVersion.none()))
                    .isInstanceOfSatisfying(ReportRecipientsInBrowserOnly.class,
                            refused -> assertThat(refused.code()).isEqualTo("donations/report-recipients-in-browser-only"));
        }
        verify(settings, never()).save(any(), any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a connected application, when it keeps the recipients, also in another case, and changes the day, the hour and the sections, then the change is saved")
    void should_save_when_changed_given_a_connected_application_keeping_the_recipients() {
        ReportSettings changed = new ReportSettings(ReportRecipients.parse(List.of("Info@NFNN.cz")), 5, 9, new ReportSections(false, true, false, true));

        SavedReportSettings saved = service.change(ADMIN, AdministrationChannel.CONNECTED_APPLICATION, changed, ExpectedVersion.none());

        assertThat(saved.settings()).isEqualTo(changed);
        verify(settings).save(changed, NOW);
    }

    @Test
    @DisplayName("Given settings changed, when the change answers, then its version is the one a later view of the saved settings gives")
    void should_answer_the_saved_version_when_changed_given_settings_changed() {
        SavedReportSettings saved = service.change(ADMIN, AdministrationChannel.BROWSER, CHANGED, ExpectedVersion.of(service.view().settingsVersion()));
        when(settings.current()).thenReturn(CHANGED);
        when(settings.lastChangedAt()).thenReturn(Optional.of(NOW));

        assertThat(saved.version()).isEqualTo(service.view().settingsVersion());
    }

    @Test
    @DisplayName("Given another version than the stored settings', when the settings are changed, then it is refused with the stored version and row with its next report, and nothing is saved or audited")
    void should_refuse_and_keep_settings_when_changed_given_another_version() {
        ReportAdministrationView view = service.view();
        String stored = view.settingsVersion();

        assertThatThrownBy(() -> service.change(ADMIN, AdministrationChannel.BROWSER, CHANGED, ExpectedVersion.of("0000000000000000")))
                .isInstanceOfSatisfying(ChangedMeanwhile.class, refusal -> {
                    assertThat(refusal.extensions()).containsEntry("version", stored);
                    assertThat(refusal.extensions().get("current")).isInstanceOfSatisfying(ReportSettingsRow.class, row -> {
                        assertThat(row.recipients()).containsExactly("info@nfnn.cz");
                        assertThat(row.version()).isEqualTo(stored);
                        assertThat(row.nextReport().month()).isEqualTo(view.nextReport().month().toString());
                        assertThat(row.nextReport().dueOn()).isEqualTo(view.nextReport().dueOn());
                        assertThat(row.lastEndedMonth()).isEqualTo(view.lastEndedMonth().toString());
                    });
                });
        verify(settings).lockForChange();
        verify(settings, never()).save(any(), any());
        verifyNoInteractions(events);
    }
}
