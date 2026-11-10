package cz.novanadeje.app.donations.domain.report;

import java.time.Instant;

public record ReportDelivery(ReportMonth month, Instant sentAt, boolean byHand, int recipientCount, ReportContent content) {

    public ReportDelivery {
        if (month == null || sentAt == null || content == null) {
            throw new IllegalArgumentException("A report's sending has its month, its time and what it said");
        }
        if (recipientCount < 1 || recipientCount > ReportRecipients.MAX_RECIPIENTS) {
            throw new IllegalArgumentException("A report goes to 1 to " + ReportRecipients.MAX_RECIPIENTS + " recipients, not " + recipientCount);
        }
    }
}
