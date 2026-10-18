package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.ReportMonth;

public record MonthlyReportOutcome(ReportMonth month, boolean sent) {

    public MonthlyReportOutcome {
        if (month == null) {
            throw new IllegalArgumentException("Report month is required");
        }
    }

    public static MonthlyReportOutcome sent(ReportMonth month) {
        return new MonthlyReportOutcome(month, true);
    }

    public static MonthlyReportOutcome alreadySent(ReportMonth month) {
        return new MonthlyReportOutcome(month, false);
    }
}
