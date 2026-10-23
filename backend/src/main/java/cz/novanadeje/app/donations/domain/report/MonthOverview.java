package cz.novanadeje.app.donations.domain.report;

public record MonthOverview(ReportMonth month, Tally donations, long newDonors, Tally unpairedPayments) {

    public MonthOverview {
        if (month == null || donations == null || unpairedPayments == null) {
            throw new IllegalArgumentException("A month overview has its month and every one of its figures");
        }
        if (newDonors < 0) {
            throw new IllegalArgumentException("New donors cannot be negative: " + newDonors);
        }
    }
}
