package cz.novanadeje.app.donations.domain.report;

import java.time.Instant;

public record SentReport(ReportMonth month, Instant sentAt) {

    public SentReport {
        if (month == null || sentAt == null) {
            throw new IllegalArgumentException("A sent report has its month and the time it was sent");
        }
    }
}
