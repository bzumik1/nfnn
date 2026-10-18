package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSummary;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Year;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class DonorDonationsService {

    private final DonationRepository donations;
    private final DonationReceiptRepository receipts;
    private final Clock clock;

    public DonorDonationsService(DonationRepository donations, DonationReceiptRepository receipts, Clock clock) {
        this.donations = donations;
        this.receipts = receipts;
        this.clock = clock;
    }

    public DonationOverview listDonations(DonorReference donor, Optional<Year> year) {
        DonationList all = DonationList.of(donations.findByDonorNewestFirst(donor));
        DonationList listed = year.map(all::inYear).orElse(all);
        return new DonationOverview(listed, receipts.findActiveSingleNumbersFor(donor));
    }

    public DonationSummaryView summarizeDonations(DonorReference donor) {
        DonationSummary summary = DonationSummary.of(donations.findByDonorNewestFirst(donor));
        return new DonationSummaryView(summary, ReceiptCalendar.lastCompleted(FoundationCalendar.today(clock)));
    }
}
