package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.donation.DonationSummary;
import cz.novanadeje.app.donations.domain.donation.YearTotal;
import cz.novanadeje.app.shared.domain.Currency;

import java.time.LocalDate;
import java.util.List;

record DonationSummaryResponse(long totalAmountMinor, Currency currency, int count, LocalDate lastReceivedAt, List<YearTotalResponse> byYear) {

    static DonationSummaryResponse from(DonationSummary summary) {
        return new DonationSummaryResponse(summary.total().amountMinor(), summary.total().currency(), summary.count(),
                summary.lastReceivedOn().orElse(null), summary.byYear().stream().map(YearTotalResponse::from).toList());
    }

    record YearTotalResponse(int year, int count, long totalAmountMinor) {

        static YearTotalResponse from(YearTotal total) {
            return new YearTotalResponse(total.year().getValue(), total.count(), total.total().amountMinor());
        }
    }
}
