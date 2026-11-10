package cz.novanadeje.app.donations.domain.report;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface MonthlyReportLog {

    boolean recordSending(ReportMonth month, Instant at);

    List<SentReport> sentReportsNewestFirst();

    Optional<SentReport> sentReportOf(ReportMonth month);
}
