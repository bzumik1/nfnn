package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.donation.DonationSummary;

import java.time.Year;

public record DonationSummaryView(DonationSummary summary, Year lastCompletedYear, Year firstReceiptYear) {

    public DonationSummaryView {
        if (summary == null || lastCompletedYear == null || firstReceiptYear == null) {
            throw new IllegalArgumentException("A donation summary view needs the summary, the last completed year and the first receipt year");
        }
    }
}
