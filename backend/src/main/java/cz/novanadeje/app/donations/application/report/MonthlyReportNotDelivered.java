package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.ReportMonth;

public class MonthlyReportNotDelivered extends RuntimeException {

    private final transient ReportMonth month;

    public MonthlyReportNotDelivered(ReportMonth month, Throwable cause) {
        super("The monthly report for " + month + " was not delivered", cause);
        this.month = month;
    }

    public ReportMonth month() {
        return month;
    }
}
