package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.time.Year;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public interface DonationReceiptRepository {

    Optional<DonationReceipt> findActiveForDonation(DonationId donation);

    Optional<DonationReceipt> findActiveForYear(DonorReference donor, Year year);

    void save(DonationReceipt receipt);

    boolean existsForDonation(DonationId donation);

    Set<DonationId> findDonationsWithReceipt(Collection<DonationId> donations);

    Map<DonationId, ReceiptNumber> findActiveSingleNumbersFor(DonorReference donor);

    long nextSerial();

    void lockDonor(DonorReference donor);
}
