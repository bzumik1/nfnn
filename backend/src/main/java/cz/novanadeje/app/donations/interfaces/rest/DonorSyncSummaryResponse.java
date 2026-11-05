package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.sync.DonorSyncSnapshot;
import cz.novanadeje.app.donations.interfaces.rest.DonationSummaryResponse.YearTotalResponse;
import cz.novanadeje.app.shared.domain.Currency;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

record DonorSyncSummaryResponse(long totalAmountMinor, Currency currency, int count, LocalDate lastReceivedAt, List<YearTotalResponse> byYear,
                                int yearlyReceiptsAvailableThrough, int receiptsAvailableFrom, Instant bankDataAsOf) {

    static DonorSyncSummaryResponse from(DonorSyncSnapshot snapshot) {
        DonationSummaryResponse summary = DonationSummaryResponse.from(snapshot.summary());
        return new DonorSyncSummaryResponse(summary.totalAmountMinor(), summary.currency(), summary.count(), summary.lastReceivedAt(), summary.byYear(),
                summary.yearlyReceiptsAvailableThrough(), summary.receiptsAvailableFrom(), snapshot.bankDataAsOf().orElse(null));
    }
}
