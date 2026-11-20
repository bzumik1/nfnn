package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;

import java.util.Optional;

public sealed interface ReceiptIssueFacts permits ReceiptIssueFacts.ForDonation, ReceiptIssueFacts.ForYear {

    ReceiptFingerprint requested();

    Optional<DonationReceipt> active();

    record ForDonation(DonationId donation, Optional<DonationReceipt> activeYearlyOfItsYear, ReceiptFingerprint requested, Optional<DonationReceipt> active)
            implements ReceiptIssueFacts {

        public ForDonation {
            if (donation == null || activeYearlyOfItsYear == null || requested == null || active == null) {
                throw new IllegalArgumentException("The donation, its year's active yearly receipt, the requested data and the active receipt are required");
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
