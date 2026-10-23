package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.report.DonorCounts;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportMonthNotEnded;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.Money;
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

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.domain.donation.Donations.received;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class MonthlyReportServiceTest {

    private static final Instant FIRST_OF_OCTOBER_AT_SEVEN = Instant.parse("2026-10-01T05:00:00Z");
    private static final ReportMonth SEPTEMBER = ReportMonth.of(2026, 9);
    private static final ReportSettings DEFAULTS = ReportSettings.defaults(new EmailAddress("info@nfnn.cz"));
    private static final ReportSettings ON_THE_FIFTH = new ReportSettings(ReportRecipients.parse(List.of("pavel@example.cz", "jakub@example.cz")), 5, 9,
            new ReportSections(true, true, false, false));
    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");

    private final DonorRecordRepository donors = mock(DonorRecordRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final BankPaymentRepository payments = mock(BankPaymentRepository.class);
    private final BankImportStateRepository importStates = mock(BankImportStateRepository.class);
    private final MonthlyReportLog reportLog = mock(MonthlyReportLog.class);
    private final ReportSettingsRepository settings = mock(ReportSettingsRepository.class);
    private final MonthlyReportSender sender = mock(MonthlyReportSender.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final MutableClock clock = new MutableClock(FIRST_OF_OCTOBER_AT_SEVEN, ZoneId.of("Europe/Prague"));
    private final MonthlyReportService service = new MonthlyReportService(donors, donations, payments, importStates, reportLog, settings, sender,
            events, clock);

    @BeforeEach
    void stubFacts() {
        when(reportLog.recordSending(any(), any())).thenReturn(true);
        when(settings.current()).thenReturn(DEFAULTS);
        when(donors.countRegisteredBefore(SEPTEMBER.start())).thenReturn(3L);
        when(donors.countRegisteredBefore(SEPTEMBER.end())).thenReturn(5L);
        when(donations.findReceivedOnBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 9, 30)))
                .thenReturn(List.of(received(LocalDate.of(2026, 3, 1), 20000), received(LocalDate.of(2026, 9, 15), 123450)));
        when(payments.findUnpairedBookedBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 9, 30)))
                .thenReturn(List.of(payment(1001, LocalDate.of(2026, 9, 2), Money.czk(15000), Optional.empty(), "1111111111")));
        when(importStates.current()).thenReturn(BankImportState.initial(FIRST_OF_OCTOBER_AT_SEVEN));
    }

    @Test
    @DisplayName("Given 07:00 on the first of October in Prague, when the due report is sent, then September is recorded, compiled from its facts and sent")
    void should_record_compile_and_send_september_when_due_report_sent_given_first_of_october() {
        MonthlyReportOutcome outcome = service.sendDueReport();

        assertThat(outcome).isEqualTo(MonthlyReportOutcome.sent(SEPTEMBER));
        verify(reportLog).recordSending(SEPTEMBER, FIRST_OF_OCTOBER_AT_SEVEN);
        MonthlyReport report = sentReport();
        assertThat(report.month()).isEqualTo(SEPTEMBER);
        assertThat(report.donors()).isEqualTo(DonorCounts.between(3, 5));
        assertThat(report.pairedInMonth()).isEqualTo(new Tally(1, Money.czk(123450)));
        assertThat(report.unpairedInMonth()).isEqualTo(new Tally(1, Money.czk(15000)));
        assertThat(report.receivedInYear()).isEqualTo(new Tally(3, Money.czk(158450)));
    }

    @Test
    @DisplayName("Given the report set to midnight and 00:30 on the first of October in Prague while UTC is still in September, when the due report is sent, then it is September's")
    void should_report_september_when_due_report_sent_given_prague_already_in_october() {
        when(settings.current()).thenReturn(new ReportSettings(DEFAULTS.recipients(), 1, 0, DEFAULTS.sections()));
        clock.set(Instant.parse("2026-09-30T22:30:00Z"));

        service.sendDueReport();

        verify(reportLog).recordSending(SEPTEMBER, Instant.parse("2026-09-30T22:30:00Z"));
    }

    @Test
    @DisplayName("Given September's report already recorded, when the due report is sent, then nothing is compiled or sent")
    void should_send_nothing_when_due_report_sent_given_month_already_recorded() {
        when(reportLog.recordSending(any(), any())).thenReturn(false);

        MonthlyReportOutcome outcome = service.sendDueReport();

        assertThat(outcome).isEqualTo(MonthlyReportOutcome.alreadySent(SEPTEMBER));
        verifyNoInteractions(sender, donors, donations, payments, importStates);
    }

    @Test
    @DisplayName("Given the first of October, when October's report is asked for, then it is refused before anything is recorded")
    void should_refuse_when_report_asked_given_month_not_completed() {
        assertThatThrownBy(() -> service.sendReportFor(ReportMonth.of(2026, 10))).isInstanceOf(ReportMonthNotEnded.class);

        verify(reportLog, never()).recordSending(any(), any());
        verifyNoInteractions(sender);
    }

    @Test
    @DisplayName("Given the first of October, when August's report is asked for directly, then August is recorded and sent")
    void should_send_earlier_month_when_report_asked_given_completed_month() {
        ReportMonth august = ReportMonth.of(2026, 8);

        MonthlyReportOutcome outcome = service.sendReportFor(august);

        assertThat(outcome).isEqualTo(MonthlyReportOutcome.sent(august));
        verify(reportLog).recordSending(august, FIRST_OF_OCTOBER_AT_SEVEN);
        assertThat(sentReport().month()).isEqualTo(august);
    }

    @Test
    @DisplayName("Given a mail server that refuses the report, when the due report is sent, then the failure reaches the caller so the record is rolled back")
    void should_propagate_failure_when_due_report_sent_given_refused_delivery() {
        MonthlyReportNotDelivered refused = new MonthlyReportNotDelivered(SEPTEMBER, new IllegalStateException("smtp down"));
        doThrow(refused).when(sender).send(any(), any());

        assertThatThrownBy(service::sendDueReport).isSameAs(refused);
    }

    @Test
    @DisplayName("Given the report set to leave on the 5th, when the due report is checked on the 1st, then nothing is recorded or sent")
    void should_send_nothing_when_due_report_checked_given_send_day_not_reached() {
        when(settings.current()).thenReturn(ON_THE_FIFTH);

        MonthlyReportOutcome outcome = service.sendDueReport();

        assertThat(outcome).isEqualTo(MonthlyReportOutcome.notDue(SEPTEMBER));
        assertThat(outcome.sent()).isFalse();
        verify(reportLog, never()).recordSending(any(), any());
        verifyNoInteractions(sender);
    }

    @Test
    @DisplayName("Given the report set to leave on the 5th at 9:00, when the due report is checked on the 5th at 8:00, then nothing is recorded or sent")
    void should_send_nothing_when_due_report_checked_given_send_hour_not_reached() {
        when(settings.current()).thenReturn(ON_THE_FIFTH);
        clock.set(Instant.parse("2026-10-05T06:00:00Z"));

        assertThat(service.sendDueReport()).isEqualTo(MonthlyReportOutcome.notDue(SEPTEMBER));

        verify(reportLog, never()).recordSending(any(), any());
        verifyNoInteractions(sender);
    }

    @Test
    @DisplayName("Given the report set to leave on the 5th at 9:00, when the due report is checked on the 5th at 9:00, then September goes out with those settings")
    void should_send_with_settings_when_due_report_checked_given_send_day_reached() {
        when(settings.current()).thenReturn(ON_THE_FIFTH);
        clock.set(Instant.parse("2026-10-05T07:00:00Z"));

        MonthlyReportOutcome outcome = service.sendDueReport();

        assertThat(outcome).isEqualTo(MonthlyReportOutcome.sent(SEPTEMBER));
        verify(sender).send(any(), org.mockito.ArgumentMatchers.eq(ON_THE_FIFTH));
    }

    @Test
    @DisplayName("Given September already sent, when an administrator sends it again, then it is compiled and sent to the current recipients and the action is audited")
    void should_send_again_and_audit_when_resent_given_month_already_sent() {
        when(reportLog.recordSending(any(), any())).thenReturn(false);
        when(settings.current()).thenReturn(ON_THE_FIFTH);

        ManualReportDelivery delivery = service.resend(ADMIN, SEPTEMBER);

        assertThat(delivery).isEqualTo(new ManualReportDelivery(SEPTEMBER, ON_THE_FIFTH.recipients(), FIRST_OF_OCTOBER_AT_SEVEN));
        assertThat(sentReport().month()).isEqualTo(SEPTEMBER);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audited.getValue().action()).isEqualTo("SEND_MONTHLY_REPORT");
        assertThat(audited.getValue().subjectId()).isEmpty();
        assertThat(audited.getValue().details()).isEqualTo("Měsíční přehled za 2026-09 ručně odeslán na pavel@example.cz, jakub@example.cz");
        assertThat(audited.getValue().performedAt()).isEqualTo(FIRST_OF_OCTOBER_AT_SEVEN);
    }

    @Test
    @DisplayName("Given September never sent, when an administrator sends it, then the month is recorded so the morning check does not send it twice")
    void should_record_month_when_resent_given_month_never_sent() {
        service.resend(ADMIN, SEPTEMBER);

        verify(reportLog).recordSending(SEPTEMBER, FIRST_OF_OCTOBER_AT_SEVEN);
    }

    @Test
    @DisplayName("Given the first of October, when an administrator sends October's report, then it is refused and nothing is audited")
    void should_refuse_when_resent_given_month_not_ended() {
        assertThatThrownBy(() -> service.resend(ADMIN, ReportMonth.of(2026, 10))).isInstanceOf(ReportMonthNotEnded.class);

        verifyNoInteractions(sender, events, reportLog);
    }

    @Test
    @DisplayName("Given a mail server that refuses the report, when an administrator sends it, then the failure reaches the caller and nothing is audited")
    void should_propagate_failure_when_resent_given_refused_delivery() {
        MonthlyReportNotDelivered refused = new MonthlyReportNotDelivered(SEPTEMBER, new IllegalStateException("smtp down"));
        doThrow(refused).when(sender).send(any(), any());

        assertThatThrownBy(() -> service.resend(ADMIN, SEPTEMBER)).isSameAs(refused);
        verifyNoInteractions(events);
    }

    private MonthlyReport sentReport() {
        ArgumentCaptor<MonthlyReport> sent = ArgumentCaptor.forClass(MonthlyReport.class);
        verify(sender).send(sent.capture(), any());
        return sent.getValue();
    }
}
