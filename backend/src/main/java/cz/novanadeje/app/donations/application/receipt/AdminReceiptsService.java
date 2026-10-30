package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptPage;
import cz.novanadeje.app.donations.domain.receipt.ReceiptQuery;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Year;
import java.util.UUID;

@Service
public class AdminReceiptsService {

    private final DonationReceiptIssuer issuer;
    private final DonationReceiptRepository receipts;
    private final ReceiptImageRepository images;
    private final FirstReceiptYear firstYear;
    private final Clock clock;

    public AdminReceiptsService(DonationReceiptIssuer issuer, DonationReceiptRepository receipts, ReceiptImageRepository images,
                                FirstReceiptYear firstYear, Clock clock) {
        this.issuer = issuer;
        this.receipts = receipts;
        this.images = images;
        this.firstYear = firstYear;
        this.clock = clock;
    }

    public DonationReceipt issueForDonation(UUID adminId, DonorReference donor, DonationId donation) {
        throw new UnsupportedOperationException("not yet");
    }

    public DonationReceipt issueForYear(UUID adminId, DonorReference donor, Year year) {
        throw new UnsupportedOperationException("not yet");
    }

    @Transactional(readOnly = true)
    public ReceiptPage receipts(ReceiptQuery query) {
        throw new UnsupportedOperationException("not yet");
    }

    @Transactional(readOnly = true)
    public DonationReceipt receipt(DonationReceiptId id) {
        throw new UnsupportedOperationException("not yet");
    }

    @Transactional(readOnly = true)
    public StoredReceiptImage signatureImage(ContentDigest digest) {
        throw new UnsupportedOperationException("not yet");
    }

    public ReceiptYears receiptYears() {
        return new ReceiptYears(ReceiptCalendar.lastCompleted(FoundationCalendar.today(clock)), firstYear.year());
    }
}
