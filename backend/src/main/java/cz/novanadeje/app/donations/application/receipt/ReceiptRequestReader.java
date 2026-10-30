package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptBeforeFirstYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNotAvailable;
import cz.novanadeje.app.donations.domain.receipt.VerificationWithoutReceipt;
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
    private final FirstReceiptYear firstYear;

    public ReceiptRequestReader(DonationRepository donations, DonorRecordRepository donorRecords, FirstReceiptYear firstYear) {
        this.donations = donations;
        this.donorRecords = donorRecords;
        this.firstYear = firstYear;
    }

    public ReceiptRequest forDonation(DonorReference donor, DonationId donationId, LocalDate today) {
        Donation donation = donations.findByIdForDonor(donationId, donor).orElseThrow(() -> new DonationNotFound(donationId));
        if (!donation.isReceived()) {
            throw new ReceiptNotAvailable(donationId);
        }
        if (donation.isAccountVerification()) {
            throw new VerificationWithoutReceipt(donationId);
        }
        if (!firstYear.admits(donation.receivedOn())) {
            throw new ReceiptBeforeFirstYear(firstYear);
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
