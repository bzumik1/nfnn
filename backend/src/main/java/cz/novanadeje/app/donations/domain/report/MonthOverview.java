package cz.novanadeje.app.donations.domain.report;

public record MonthOverview(ReportMonth month, Tally paired, long newDonors, Tally unpaired) {

    public MonthOverview {
        if (month == null || paired == null || unpaired == null) {
            throw new IllegalArgumentException("A month overview has its month and every one of its figures");
        }
        if (newDonors < 0) {
            throw new IllegalArgumentException("New donors cannot be negative: " + newDonors);
        }
    }

    public Tally received() {
        return paired.plus(unpaired);
    }
}
