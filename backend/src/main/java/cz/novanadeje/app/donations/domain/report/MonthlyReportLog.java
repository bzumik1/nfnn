package cz.novanadeje.app.donations.domain.report;

import java.time.Instant;

public interface MonthlyReportLog {

    boolean recordSending(ReportMonth month, Instant at);
}
