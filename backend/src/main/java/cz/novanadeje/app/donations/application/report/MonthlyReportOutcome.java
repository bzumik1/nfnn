package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.ReportMonth;

public record MonthlyReportOutcome(ReportMonth month, Kind kind) {

    public enum Kind { SENT, ALREADY_SENT, NOT_DUE }

    public MonthlyReportOutcome {
        if (month == null || kind == null) {
            throw new IllegalArgumentException("Report month and outcome are required");
        }
    }

    public static MonthlyReportOutcome sent(ReportMonth month) {
        return new MonthlyReportOutcome(month, Kind.SENT);
    }

    public static MonthlyReportOutcome alreadySent(ReportMonth month) {
        return new MonthlyReportOutcome(month, Kind.ALREADY_SENT);
    }

    public static MonthlyReportOutcome notDue(ReportMonth month) {
        return new MonthlyReportOutcome(month, Kind.NOT_DUE);
    }

    public boolean sent() {
        return kind == Kind.SENT;
    }
}
