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
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

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

    private final DonorRecordRepository donors = mock(DonorRecordRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final BankPaymentRepository payments = mock(BankPaymentRepository.class);
    private final BankImportStateRepository importStates = mock(BankImportStateRepository.class);
    private final MonthlyReportLog reportLog = mock(MonthlyReportLog.class);
    private final MonthlyReportSender sender = mock(MonthlyReportSender.class);
    private final MutableClock clock = new MutableClock(FIRST_OF_OCTOBER_AT_SEVEN, ZoneId.of("Europe/Prague"));
    private final MonthlyReportService service = new MonthlyReportService(donors, donations, payments, importStates, reportLog, sender, clock);

    @BeforeEach
    void stubFacts() {
        when(reportLog.recordSending(any(), any())).thenReturn(true);
        when(donors.countRegisteredBefore(SEPTEMBER.start())).thenReturn(3L);
        when(donors.countRegisteredBefore(SEPTEMBER.end())).thenReturn(5L);
        when(donations.findReceivedOnBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 9, 30)))
                .thenReturn(List.of(received(LocalDate.of(2026, 3, 1), 20000), received(LocalDate.of(2026, 9, 15), 123450)));
        when(payments.findUnpairedBookedBetween(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30)))
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
        assertThat(report.donationsInMonth()).isEqualTo(new Tally(1, Money.czk(123450)));
        assertThat(report.donationsInYear()).isEqualTo(new Tally(2, Money.czk(143450)));
        assertThat(report.unpairedPaymentsInMonth()).isEqualTo(new Tally(1, Money.czk(15000)));
    }

    @Test
    @DisplayName("Given 00:30 on the first of October in Prague while UTC is still in September, when the due report is sent, then it is September's")
    void should_report_september_when_due_report_sent_given_prague_already_in_october() {
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
        assertThatThrownBy(() -> service.sendReportFor(ReportMonth.of(2026, 10))).isInstanceOf(IllegalArgumentException.class);

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
        doThrow(refused).when(sender).send(any());

        assertThatThrownBy(service::sendDueReport).isSameAs(refused);
    }

    private MonthlyReport sentReport() {
        ArgumentCaptor<MonthlyReport> sent = ArgumentCaptor.forClass(MonthlyReport.class);
        verify(sender).send(sent.capture());
        return sent.getValue();
    }
}
