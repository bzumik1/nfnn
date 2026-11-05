package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStanding;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class ReceiptStatusService {

    private final DonationReceiptRepository receipts;

    public ReceiptStatusService(DonationReceiptRepository receipts) {
        this.receipts = receipts;
    }

    public Optional<ReceiptStanding> statusOf(ContentDigest statusDigest) {
        return receipts.findStandingByStatusDigest(statusDigest);
    }
}
