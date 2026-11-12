package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;

public record PairedDonationView(Donation donation, DonorRecord donor, boolean receiptIssued) {

    public PairedDonationView {
        if (donation == null || donor == null) {
            throw new IllegalArgumentException("A paired donation view needs the donation and the donor's record");
        }
    }
}
