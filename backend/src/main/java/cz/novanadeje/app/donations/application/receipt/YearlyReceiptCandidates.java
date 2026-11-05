package cz.novanadeje.app.donations.application.receipt;

import java.time.Year;
import java.util.List;

public record YearlyReceiptCandidates(Year year, ReceiptYears years, List<YearlyReceiptCandidate> donors, int erasedDonors) {

    public YearlyReceiptCandidates {
        donors = List.copyOf(donors);
    }
}
