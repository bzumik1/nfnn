package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.report.BankImportStatus;
import cz.novanadeje.app.donations.domain.report.DonorCounts;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportContent;
import cz.novanadeje.app.donations.domain.report.ReportDeliveries;
import cz.novanadeje.app.donations.domain.report.ReportDelivery;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.SentReport;
import cz.novanadeje.app.donations.domain.report.SentReportNotFound;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SentReportServiceTest {

    private static final ReportMonth OCTOBER = ReportMonth.of(2026, 10);
    private static final Instant FIRST_SENT_AT = Instant.parse("2026-11-01T06:00:00Z");
    private static final MonthlyReport TODAYS_FIGURES = new MonthlyReport(OCTOBER, DonorCounts.between(3, 5), new Tally(2, Money.czk(30000)),
            new Tally(1, Money.czk(15000)), new Tally(9, Money.czk(120000)), BankImportStatus.of(BankImportState.initial(FIRST_SENT_AT)));

    private final MonthlyReportLog reportLog = mock(MonthlyReportLog.class);
    private final ReportDeliveries deliveries = mock(ReportDeliveries.class);
    private final MonthlyReportFigures figures = mock(MonthlyReportFigures.class);
    private final SentReportService service = new SentReportService(reportLog, deliveries, figures);

    @Test
    @DisplayName("Given October sent in the morning and again by hand, when it is opened, then both kept sendings come newest first and nothing is recomputed")
    void should_list_kept_deliveries_when_opened_given_month_sent_twice() {
        ReportContent content = ReportContent.of(TODAYS_FIGURES, ReportSections.all());
        ReportDelivery morning = new ReportDelivery(OCTOBER, FIRST_SENT_AT, false, 1, content);
        ReportDelivery byHand = new ReportDelivery(OCTOBER, FIRST_SENT_AT.plusSeconds(86400), true, 2, content);
        when(reportLog.sentReportOf(OCTOBER)).thenReturn(Optional.of(new SentReport(OCTOBER, FIRST_SENT_AT)));
        when(deliveries.ofMonthNewestFirst(OCTOBER)).thenReturn(List.of(byHand, morning));

        SentReportView view = service.view(OCTOBER);

        assertThat(view).isEqualTo(new SentReportView(OCTOBER, FIRST_SENT_AT, List.of(byHand, morning), Optional.empty()));
        verifyNoInteractions(figures);
    }

    @Test
    @DisplayName("Given October sent before sendings were kept, when it is opened, then it is recomputed from today's figures without the bank")
    void should_recompute_without_bank_when_opened_given_month_sent_before_deliveries_were_kept() {
        when(reportLog.sentReportOf(OCTOBER)).thenReturn(Optional.of(new SentReport(OCTOBER, FIRST_SENT_AT)));
        when(deliveries.ofMonthNewestFirst(OCTOBER)).thenReturn(List.of());
        when(figures.compile(OCTOBER)).thenReturn(TODAYS_FIGURES);

        SentReportView view = service.view(OCTOBER);

        assertThat(view.deliveries()).isEmpty();
        assertThat(view.recomputed()).contains(ReportContent.recomputedFrom(TODAYS_FIGURES));
        assertThat(view.recomputed().orElseThrow().bankImport()).isEmpty();
    }

    @Test
    @DisplayName("Given October never sent, when it is opened, then it is not found and nothing is computed")
    void should_refuse_when_opened_given_month_never_sent() {
        when(reportLog.sentReportOf(OCTOBER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.view(OCTOBER)).isInstanceOf(SentReportNotFound.class);
        verifyNoInteractions(figures, deliveries);
    }
}
