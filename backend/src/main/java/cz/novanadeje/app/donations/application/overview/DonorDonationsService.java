package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSummary;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Year;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class DonorDonationsService {

    private final DonationRepository donations;

    public DonorDonationsService(DonationRepository donations) {
        this.donations = donations;
    }

    public DonationList listDonations(DonorReference donor, Optional<Year> year) {
        DonationList all = DonationList.of(donations.findByDonorNewestFirst(donor));
        return year.map(all::inYear).orElse(all);
    }

    public DonationSummary summarizeDonations(DonorReference donor) {
        return DonationSummary.of(donations.findByDonorNewestFirst(donor));
    }
}
