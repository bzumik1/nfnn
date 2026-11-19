package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;

import java.util.Optional;

public sealed interface ReceiptIssueFacts permits ReceiptIssueFacts.ForGift, ReceiptIssueFacts.ForYear {

    ReceiptFingerprint requested();

    Optional<DonationReceipt> active();

    record ForGift(DonationId gift, Optional<DonationReceipt> activeYearlyOfItsYear, ReceiptFingerprint requested, Optional<DonationReceipt> active)
            implements ReceiptIssueFacts {

        public ForGift {
            if (gift == null || activeYearlyOfItsYear == null || requested == null || active == null) {
                throw new IllegalArgumentException("The gift, its year's active yearly receipt, the requested data and the active receipt are required");
            }
        }
    }

    record ForYear(ReceiptFingerprint requested, Optional<DonationReceipt> active) implements ReceiptIssueFacts {

        public ForYear {
            if (requested == null || active == null) {
                throw new IllegalArgumentException("The requested data and the active receipt are required");
            }
        }
    }
}
