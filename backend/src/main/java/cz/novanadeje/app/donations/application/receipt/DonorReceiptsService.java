package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNotFound;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class DonorReceiptsService {

    private final DonationReceiptRepository receipts;
    private final ReceiptImageRepository images;

    public DonorReceiptsService(DonationReceiptRepository receipts, ReceiptImageRepository images) {
        this.receipts = receipts;
        this.images = images;
    }

    public List<DonationReceipt> receiptsOf(DonorReference donor) {
        return List.of();
    }

    public DonationReceipt receiptOf(DonorReference donor, DonationReceiptId id) {
        throw new ReceiptNotFound(id);
    }

    public StoredReceiptImage signatureImageOf(DonorReference donor, ContentDigest digest) {
        throw new ReceiptImageNotFound(digest);
    }
}
