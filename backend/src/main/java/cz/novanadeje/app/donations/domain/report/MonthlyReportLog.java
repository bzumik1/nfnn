package cz.novanadeje.app.donations.domain.report;

import java.time.Instant;
import java.util.List;

public interface MonthlyReportLog {

    boolean recordSending(ReportMonth month, Instant at);

    List<SentReport> sentReportsNewestFirst();
}
