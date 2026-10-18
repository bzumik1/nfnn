package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.donations.domain.receipt.YearNotYetCompleted;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Year;

@Service
public class DonationReceiptService {

    private final DonationReceiptIssuer issuer;
    private final ReceiptRenderingLimit renderingLimit;
    private final Clock clock;

    public DonationReceiptService(DonationReceiptIssuer issuer, ReceiptRenderingLimit renderingLimit, Clock clock) {
        this.issuer = issuer;
        this.renderingLimit = renderingLimit;
        this.clock = clock;
    }

    public IssuedReceipt singleReceipt(DonorReference donor, DonationId donationId) {
        LocalDate today = FoundationCalendar.today(clock);
        return renderingLimit.withinLimit(() -> issuer.issueForDonation(donor, donationId, today));
    }

    public IssuedReceipt yearlyReceipt(DonorReference donor, Year year) {
        LocalDate today = FoundationCalendar.today(clock);
        if (!ReceiptCalendar.isCompleted(year, today)) {
            throw new YearNotYetCompleted(year);
        }
        return renderingLimit.withinLimit(() -> issuer.issueForYear(donor, year, today));
    }
}
