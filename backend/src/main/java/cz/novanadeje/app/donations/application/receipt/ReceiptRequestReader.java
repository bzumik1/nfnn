package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNotAvailable;
import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptNotAvailable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;

@Component
@Transactional(propagation = Propagation.MANDATORY)
public class ReceiptRequestReader {

    private final DonationRepository donations;
    private final DonorRecordRepository donorRecords;

    public ReceiptRequestReader(DonationRepository donations, DonorRecordRepository donorRecords) {
        this.donations = donations;
        this.donorRecords = donorRecords;
    }

    public ReceiptRequest forDonation(DonorReference donor, DonationId donationId, LocalDate today) {
        Donation donation = donations.findByIdForDonor(donationId, donor).orElseThrow(() -> new DonationNotFound(donationId));
        if (!donation.isReceived()) {
            throw new ReceiptNotAvailable(donationId);
        }
        return ReceiptRequest.forDonation(record(donor), donation, today);
    }

    public ReceiptRequest forYear(DonorReference donor, Year year, LocalDate today) {
        List<Donation> received = donations.findByDonorNewestFirst(donor).stream()
                .filter(Donation::isReceived)
                .filter(donation -> donation.receivedIn(year))
                .toList()
                .reversed();
        if (received.isEmpty()) {
            throw new YearlyReceiptNotAvailable(year);
        }
        return ReceiptRequest.forYear(record(donor), year, received, today);
    }

    private DonorRecord record(DonorReference donor) {
        return donorRecords.findById(donor)
                .orElseThrow(() -> new IllegalStateException("Donor " + donor + " has donations but no donor record"));
    }
}
