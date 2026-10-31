package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptPage;
import cz.novanadeje.app.donations.domain.receipt.ReceiptQuery;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Year;
import java.util.UUID;

@Service
public class AdminReceiptsService {

    private final DonationReceiptIssuer issuer;
    private final DonationReceiptRepository receipts;
    private final ReceiptImageRepository images;
    private final DonorRecordRepository donorRecords;
    private final FirstReceiptYear firstYear;
    private final Clock clock;

    public AdminReceiptsService(DonationReceiptIssuer issuer, DonationReceiptRepository receipts, ReceiptImageRepository images,
                                DonorRecordRepository donorRecords, FirstReceiptYear firstYear, Clock clock) {
        this.issuer = issuer;
        this.receipts = receipts;
        this.images = images;
        this.donorRecords = donorRecords;
        this.firstYear = firstYear;
        this.clock = clock;
    }

    public DonationReceipt issueForDonation(UUID adminId, AdministrationChannel channel, DonorReference donor, DonationId donation) {
        return issuer.issueForDonationByAdministrator(adminId, channel, donor, donation, FoundationCalendar.today(clock));
    }

    public DonationReceipt issueForYear(UUID adminId, AdministrationChannel channel, DonorReference donor, Year year) {
        LocalDate today = FoundationCalendar.today(clock);
        DonationReceiptService.requireCompletedYear(firstYear, year, today);
        return issuer.issueForYearByAdministrator(adminId, channel, donor, year, today);
    }

    @Transactional(readOnly = true)
    public ReceiptPage receipts(ReceiptQuery query) {
        return receipts.findNewestFirst(query);
    }

    @Transactional(readOnly = true)
    public AdminReceiptView receipt(DonationReceiptId id) {
        DonationReceipt receipt = receipts.findById(id).orElseThrow(() -> new ReceiptNotFound(id));
        DonorRecord donor = donorRecords.findById(receipt.donor())
                .orElseThrow(() -> new IllegalStateException("Receipt " + id + " names donor " + receipt.donor() + " without a donor record"));
        return new AdminReceiptView(receipt, donor.isErased());
    }

    @Transactional(readOnly = true)
    public StoredReceiptImage signatureImage(ContentDigest digest) {
        if (!receipts.anyShowsSignatureImage(digest)) {
            throw new ReceiptImageNotFound(digest);
        }
        return images.find(digest).orElseThrow(() -> new ReceiptImageNotFound(digest));
    }

    public ReceiptYears receiptYears() {
        return new ReceiptYears(ReceiptCalendar.lastCompleted(FoundationCalendar.today(clock)), firstYear.year());
    }
}
