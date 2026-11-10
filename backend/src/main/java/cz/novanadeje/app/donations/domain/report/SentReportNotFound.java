package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class SentReportNotFound extends NotFound {

    public static final String CODE = "donations/sent-report-not-found";

    public SentReportNotFound() {
        super(CODE, "No monthly report was sent for the month asked for");
    }
}
