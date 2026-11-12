package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.ReportContent;
import cz.novanadeje.app.donations.domain.report.ReportDelivery;
import cz.novanadeje.app.donations.domain.report.ReportMonth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public record SentReportView(ReportMonth month, Instant firstSentAt, List<ReportDelivery> deliveries, Optional<ReportContent> recomputed) {

    public SentReportView {
        deliveries = List.copyOf(deliveries);
    }
}
