package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.donation.DonationSummary;

import java.time.Year;

public record DonationSummaryView(DonationSummary summary, Year lastCompletedYear) {

    public DonationSummaryView {
        if (summary == null || lastCompletedYear == null) {
            throw new IllegalArgumentException("A donation summary view needs the summary and the last completed year");
        }
    }
}
