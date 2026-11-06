package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class ReportRecipientsInBrowserOnly extends AccessDenied {

    public static final String CODE = "donations/report-recipients-in-browser-only";

    public ReportRecipientsInBrowserOnly() {
        super(CODE, "The recipients of the monthly report change only in the administration in a browser, never through a connected application");
    }
}
