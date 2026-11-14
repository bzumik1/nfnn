package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.time.Instant;
import java.time.Year;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public interface DonationReceiptRepository {

    Optional<DonationReceipt> findById(DonationReceiptId id);

    Optional<DonationReceipt> findActiveForDonation(DonationId donation);

    List<DonationReceipt> findActiveSinglesFor(Collection<DonationId> donations);

    Optional<DonationReceipt> findActiveForYear(DonorReference donor, Year year);

    Optional<DonationReceipt> findLatestOutdatedForYear(DonorReference donor, Year year);

    void save(DonationReceipt receipt);

    boolean existsForDonation(DonationId donation);

    boolean existsYearlyIssuedSince(DonorReference donor, Year year, Instant since);

    long countReplacementsIssuedAfter(DonorReference donor, Instant after);

    long countReplacementsIssuedSince(DonorReference donor, Instant since);

    Set<DonationId> findDonationsWithReceipt(Collection<DonationId> donations);

    Map<DonationId, ReceiptNumber> findActiveSingleNumbersFor(DonorReference donor);

    List<DonationReceipt> findByDonorNewestFirst(DonorReference donor);

    List<ActiveYearlyReceipt> findActiveYearlyOfEveryDonor(Year year);

    boolean existsActiveForYear(DonorReference donor, Year year);

    List<ReceiptSummary> findAllSummariesNewestFirst();

    boolean showsImage(DonorReference donor, ContentDigest image);

    Optional<ReceiptStanding> findStandingByStatusDigest(ContentDigest statusDigest);

    boolean anyShowsImage(ContentDigest image);

    ReceiptPage findNewestFirst(ReceiptQuery query);

    long nextSerial();

    void lockDonor(DonorReference donor);
}
