package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptBeforeFirstYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.donations.domain.receipt.YearNotYetCompleted;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Year;

@Service
public class DonationReceiptService {

    private final DonationReceiptIssuer issuer;
    private final Clock clock;
    private final FirstReceiptYear firstYear;

    public DonationReceiptService(DonationReceiptIssuer issuer, Clock clock, FirstReceiptYear firstYear) {
        this.issuer = issuer;
        this.clock = clock;
        this.firstYear = firstYear;
    }

    public DonationReceipt issueForDonation(DonorReference donor, DonationId donationId) {
        return issuer.issueForDonation(donor, donationId, FoundationCalendar.today(clock));
    }

    public DonationReceipt issueForYear(DonorReference donor, Year year) {
        LocalDate today = FoundationCalendar.today(clock);
        requireCompletedYear(firstYear, year, today);
        return issuer.issueForYear(donor, year, today);
    }

    static void requireCompletedYear(FirstReceiptYear firstYear, Year year, LocalDate today) {
        if (!firstYear.admits(year)) {
            throw new ReceiptBeforeFirstYear(firstYear);
        }
        if (!ReceiptCalendar.isCompleted(year, today)) {
            throw new YearNotYetCompleted(year);
        }
    }
}
