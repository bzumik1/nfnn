package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.time.Year;
import java.util.Map;
import java.util.Optional;

public interface DonationReceiptRepository {

    Optional<DonationReceipt> findActiveForDonation(DonationId donation);

    Optional<DonationReceipt> findActiveForYear(DonorReference donor, Year year);

    void save(DonationReceipt receipt);

    Map<DonationId, ReceiptNumber> findActiveSingleNumbersFor(DonorReference donor);

    long nextSerial();

    void lockDonor(DonorReference donor);
}
