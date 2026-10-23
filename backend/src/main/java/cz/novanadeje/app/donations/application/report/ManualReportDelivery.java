package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;

import java.time.Instant;

public record ManualReportDelivery(ReportMonth month, ReportRecipients recipients, Instant sentAt) {

    public ManualReportDelivery {
        if (month == null || recipients == null || sentAt == null) {
            throw new IllegalArgumentException("A delivery names the month, the recipients and the time");
        }
    }
}
