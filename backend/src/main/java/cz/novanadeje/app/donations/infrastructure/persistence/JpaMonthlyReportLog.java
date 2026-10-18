package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import org.springframework.stereotype.Repository;

import java.time.Instant;

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
}
