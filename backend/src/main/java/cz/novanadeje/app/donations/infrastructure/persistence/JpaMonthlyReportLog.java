package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.SentReport;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;

@Repository
class JpaMonthlyReportLog implements MonthlyReportLog {

    private final MonthlyReportJpaRepository jpa;

    JpaMonthlyReportLog(MonthlyReportJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public boolean recordSending(ReportMonth month, Instant at) {
        return jpa.insertIgnoringRecordedMonth(month.firstDay(), at) == 1;
    }

    @Override
    public List<SentReport> sentReportsNewestFirst() {
        return jpa.findAll(Sort.by(Sort.Direction.DESC, "reportMonth")).stream()
                .map(entity -> new SentReport(new ReportMonth(YearMonth.from(entity.reportMonth())), entity.sentAt()))
                .toList();
    }
}
