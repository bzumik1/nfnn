package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportContent;
import cz.novanadeje.app.donations.domain.report.ReportDeliveries;
import cz.novanadeje.app.donations.domain.report.ReportDelivery;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.SentReport;
import cz.novanadeje.app.donations.domain.report.SentReportNotFound;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class SentReportService {

    private final MonthlyReportLog reportLog;
    private final ReportDeliveries deliveries;
    private final MonthlyReportFigures figures;

    public SentReportService(MonthlyReportLog reportLog, ReportDeliveries deliveries, MonthlyReportFigures figures) {
        this.reportLog = reportLog;
        this.deliveries = deliveries;
        this.figures = figures;
    }

    @Transactional(readOnly = true)
    public SentReportView view(ReportMonth month) {
        SentReport sent = reportLog.sentReportOf(month).orElseThrow(SentReportNotFound::new);
        List<ReportDelivery> kept = deliveries.ofMonthNewestFirst(month);
        Optional<ReportContent> recomputed = kept.isEmpty()
                ? Optional.of(ReportContent.recomputedFrom(figures.compile(month)))
                : Optional.empty();
        return new SentReportView(month, sent.sentAt(), kept, recomputed);
    }
}
