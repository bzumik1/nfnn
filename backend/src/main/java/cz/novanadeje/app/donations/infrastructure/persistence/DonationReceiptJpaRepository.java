package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface DonationReceiptJpaRepository extends JpaRepository<DonationReceiptJpaEntity, UUID> {

    Optional<DonationReceiptJpaEntity> findByDonationIdAndSupersededAtIsNull(UUID donationId);

    boolean existsByDonationId(UUID donationId);

    boolean existsByDonorIdAndKindAndReceiptYearAndIssuedAtGreaterThanEqual(UUID donorId, ReceiptKind kind, Integer receiptYear, Instant issuedAt);

    @Query("select distinct r.donationId from DonationReceiptJpaEntity r where r.donationId in :donationIds")
    Set<UUID> findDonationIdsWithReceipt(@Param("donationIds") Collection<UUID> donationIds);

    Optional<DonationReceiptJpaEntity> findByDonorIdAndReceiptYearAndSupersededAtIsNull(UUID donorId, Integer receiptYear);

    List<SingleReceiptNumber> findByDonorIdAndKindAndSupersededAtIsNull(UUID donorId, ReceiptKind kind);

    @Transactional
    @Query(nativeQuery = true, value = "select nextval('donation_receipt_number_seq')")
    long nextSerial();

    @Transactional(propagation = Propagation.MANDATORY)
    @Query(nativeQuery = true, value = "select donor_id from donor_record where donor_id = :donorId for update")
    Optional<UUID> lockDonorRecord(@Param("donorId") UUID donorId);

    interface SingleReceiptNumber {

        UUID getDonationId();

        String getNumber();
    }
}
