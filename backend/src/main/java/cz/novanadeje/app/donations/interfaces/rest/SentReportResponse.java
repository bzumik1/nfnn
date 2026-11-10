package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.report.SentReportView;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.report.BankImportStatus;
import cz.novanadeje.app.donations.domain.report.ReportContent;
import cz.novanadeje.app.donations.domain.report.ReportDelivery;
import cz.novanadeje.app.donations.interfaces.rest.AdminOverviewResponse.TallyResponse;

import java.time.Instant;
import java.util.List;

public record SentReportResponse(String month, Instant firstSentAt, List<Delivery> deliveries, Content recomputed) {

    public record Delivery(Instant sentAt, boolean byHand, int recipientCount, Content content) {

        static Delivery from(ReportDelivery delivery) {
            return new Delivery(delivery.sentAt(), delivery.byHand(), delivery.recipientCount(), Content.from(delivery.content()));
        }
    }

    public record Content(Donors donors, Donations donations, TallyResponse unpairedPayments, BankImport bankImport) {

        static Content from(ReportContent content) {
            return new Content(
                    content.donors().map(donors -> new Donors(donors.registered(), donors.newInMonth())).orElse(null),
                    content.donations().map(donations -> new Donations(TallyResponse.from(donations.received()),
                            TallyResponse.from(donations.paired()), TallyResponse.from(donations.receivedInYear()))).orElse(null),
                    content.unpairedPayments().map(TallyResponse::from).orElse(null),
                    content.bankImport().map(BankImport::from).orElse(null));
        }
    }

    public record Donors(long registered, long newInMonth) {
    }

    public record Donations(TallyResponse received, TallyResponse paired, TallyResponse receivedInYear) {
    }

    public record BankImport(Instant lastSucceededAt, LastFailure lastFailure) {

        static BankImport from(BankImportStatus status) {
            return new BankImport(status.lastSucceededAt().orElse(null),
                    status.lastFailure().map(failure -> new LastFailure(failure.kind(), failure.attemptedAt())).orElse(null));
        }
    }

    public record LastFailure(ImportFailureKind kind, Instant attemptedAt) {
    }

    static SentReportResponse from(SentReportView view) {
        return new SentReportResponse(view.month().toString(), view.firstSentAt(), view.deliveries().stream().map(Delivery::from).toList(),
                view.recomputed().map(Content::from).orElse(null));
    }
}
