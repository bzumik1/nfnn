package cz.novanadeje.app.donations.domain.report;

public record DonationTallies(Tally received, Tally paired, Tally receivedInYear) {

    public DonationTallies {
        if (received == null || paired == null || receivedInYear == null) {
            throw new IllegalArgumentException("The donations of a report have the month's received and paired gifts and the year's received ones");
        }
    }
}
