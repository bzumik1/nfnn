package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

interface IssuedReceiptJpaRepository extends JpaRepository<IssuedReceiptJpaEntity, UUID> {

    Optional<IssuedReceiptJpaEntity> findByDonationIdAndStatus(UUID donationId, ReceiptStatus status);

    boolean existsByDonationId(UUID donationId);

    boolean existsByDonorIdAndKindAndReceiptYearAndIssuedAtGreaterThanEqual(UUID donorId, ReceiptKind kind, Integer receiptYear, Instant issuedAt);

    long countByDonorIdAndSupersedesIdIsNotNullAndIssuedAtAfter(UUID donorId, Instant issuedAt);

    @Query("select distinct r.donationId from IssuedReceiptJpaEntity r where r.donationId in :donationIds")
    Set<UUID> findDonationIdsWithReceipt(@Param("donationIds") Collection<UUID> donationIds);

    Optional<IssuedReceiptJpaEntity> findByDonorIdAndReceiptYearAndStatus(UUID donorId, Integer receiptYear, ReceiptStatus status);

    List<SingleReceiptNumber> findByDonorIdAndKindAndStatus(UUID donorId, ReceiptKind kind, ReceiptStatus status);

    List<IssuedReceiptJpaEntity> findByDonorIdOrderByIssuedAtDescNumberDesc(UUID donorId);

    boolean existsByDonorIdAndSignatureImageSha256(UUID donorId, String signatureImageSha256);

    @Query("select r.status from IssuedReceiptJpaEntity r where r.statusSha256 = :statusSha256")
    Optional<ReceiptStatus> findStatusByStatusSha256(@Param("statusSha256") String statusSha256);

    boolean existsBySignatureImageSha256(String signatureImageSha256);

    Page<IssuedReceiptJpaEntity> findAllBy(Pageable page);

    Page<IssuedReceiptJpaEntity> findByDonorId(UUID donorId, Pageable page);

    Page<IssuedReceiptJpaEntity> findByIssuedOnBetween(LocalDate from, LocalDate to, Pageable page);

    Page<IssuedReceiptJpaEntity> findByDonorIdAndIssuedOnBetween(UUID donorId, LocalDate from, LocalDate to, Pageable page);

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
