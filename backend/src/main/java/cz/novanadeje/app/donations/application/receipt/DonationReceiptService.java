package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNotAvailable;
import cz.novanadeje.app.donations.domain.receipt.YearNotYetCompleted;
import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptNotAvailable;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;

@Service
public class DonationReceiptService {

    private final DonationRepository donations;
    private final DonorRecordRepository donorRecords;
    private final DonationReceiptIssuer issuer;
    private final ReceiptRenderingLimit renderingLimit;
    private final Clock clock;

    public DonationReceiptService(DonationRepository donations, DonorRecordRepository donorRecords, DonationReceiptIssuer issuer,
                                  ReceiptRenderingLimit renderingLimit, Clock clock) {
        this.donations = donations;
        this.donorRecords = donorRecords;
        this.issuer = issuer;
        this.renderingLimit = renderingLimit;
        this.clock = clock;
    }

    public IssuedReceipt singleReceipt(DonorReference donor, DonationId donationId) {
        LocalDate today = FoundationCalendar.today(clock);
        Donation donation = donations.findByIdForDonor(donationId, donor).orElseThrow(() -> new DonationNotFound(donationId));
        if (!donation.isReceived()) {
            throw new ReceiptNotAvailable(donationId);
        }
        ReceiptRequest request = ReceiptRequest.forDonation(record(donor), donation, today);
        return renderingLimit.withinLimit(() -> issuer.issue(request));
    }

    public IssuedReceipt yearlyReceipt(DonorReference donor, Year year) {
        LocalDate today = FoundationCalendar.today(clock);
        if (!ReceiptCalendar.isCompleted(year, today)) {
            throw new YearNotYetCompleted(year);
        }
        List<Donation> received = donations.findByDonorNewestFirst(donor).stream()
                .filter(Donation::isReceived)
                .filter(donation -> donation.receivedIn(year))
                .toList()
                .reversed();
        if (received.isEmpty()) {
            throw new YearlyReceiptNotAvailable(year);
        }
        ReceiptRequest request = ReceiptRequest.forYear(record(donor), year, received, today);
        return renderingLimit.withinLimit(() -> issuer.issue(request));
    }

    private DonorRecord record(DonorReference donor) {
        return donorRecords.findById(donor)
                .orElseThrow(() -> new IllegalStateException("Donor " + donor + " has donations but no donor record"));
    }
}
