package cz.novanadeje.app.donations.domain.report;

public record MonthOverview(ReportMonth month, Tally paired, long givingDonors, long newDonors, Tally unpaired) {

    public MonthOverview {
        if (month == null || paired == null || unpaired == null) {
            throw new IllegalArgumentException("A month overview has its month and every one of its figures");
        }
        if (newDonors < 0) {
            throw new IllegalArgumentException("New donors cannot be negative: " + newDonors);
        }
        if (givingDonors < 0 || givingDonors > paired.count()) {
            throw new IllegalArgumentException("Giving donors are between zero and the paired donations: " + givingDonors + " of " + paired.count());
        }
    }

    public Tally received() {
        return paired.plus(unpaired);
    }
}
