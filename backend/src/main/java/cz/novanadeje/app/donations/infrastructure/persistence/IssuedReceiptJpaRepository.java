package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSummary;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawal;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawalReason;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
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

    long countByDonorIdAndSupersedesIdIsNotNullAndIssuedAtGreaterThanEqual(UUID donorId, Instant issuedAt);

    @Query("select distinct r.donationId from IssuedReceiptJpaEntity r where r.donationId in :donationIds")
    Set<UUID> findDonationIdsWithReceipt(@Param("donationIds") Collection<UUID> donationIds);

    Optional<IssuedReceiptJpaEntity> findByDonorIdAndReceiptYearAndStatus(UUID donorId, Integer receiptYear, ReceiptStatus status);

    List<IssuedReceiptJpaEntity> findByReceiptYearAndStatus(Integer receiptYear, ReceiptStatus status);

    Optional<IssuedReceiptJpaEntity> findFirstByDonorIdAndReceiptYearAndStatusAndWithdrawalReasonOrderByIssuedAtDescNumberDesc(UUID donorId,
            Integer receiptYear, ReceiptStatus status, ReceiptWithdrawalReason withdrawalReason);

    List<SingleReceiptNumber> findByDonorIdAndKindAndStatus(UUID donorId, ReceiptKind kind, ReceiptStatus status);

    List<IssuedReceiptJpaEntity> findByDonorIdOrderByIssuedAtDescNumberDesc(UUID donorId);

    @Query(nativeQuery = true, value = """
            select r.id as id, r.donor_id as donorId, r.kind as kind, r.number as number, r.donation_id as donationId, r.receipt_year as receiptYear,
                   r.issued_on as issuedOn, r.issued_at as issuedAt, r.locale as locale, r.status as status, r.superseded_at as supersededAt,
                   r.withdrawn_at as withdrawnAt, r.withdrawal_reason as withdrawalReason,
                   r.gift_count as giftCount, r.total_amount_minor as totalAmountMinor, r.certified_year as certifiedYear
            from issued_receipt r
            order by r.issued_at desc, r.number desc""")
    List<SummaryRow> findAllSummariesNewestFirst();

    @Query("select count(r) > 0 from IssuedReceiptJpaEntity r where r.donorId = :donorId and (r.signatureImageSha256 = :image or r.portraitImageSha256 = :image)")
    boolean showsImage(@Param("donorId") UUID donorId, @Param("image") String image);

    @Query("select r.status as status, r.withdrawalReason as withdrawalReason from IssuedReceiptJpaEntity r where r.statusSha256 = :statusSha256")
    Optional<KeptStatus> findStatusByStatusSha256(@Param("statusSha256") String statusSha256);

    boolean existsBySignatureImageSha256OrPortraitImageSha256(String signatureImageSha256, String portraitImageSha256);

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

    interface SummaryRow {

        UUID getId();

        UUID getDonorId();

        String getKind();

        String getNumber();

        UUID getDonationId();

        Integer getReceiptYear();

        LocalDate getIssuedOn();

        Instant getIssuedAt();

        String getLocale();

        String getStatus();

        Instant getSupersededAt();

        Instant getWithdrawnAt();

        String getWithdrawalReason();

        Integer getGiftCount();

        Long getTotalAmountMinor();

        Integer getCertifiedYear();

        default ReceiptSummary toSummary() {
            Optional<Year> year = Optional.ofNullable(getReceiptYear()).map(Year::of);
            return new ReceiptSummary(new DonationReceiptId(getId()), new DonorReference(getDonorId()), ReceiptKind.valueOf(getKind()),
                    new ReceiptNumber(getNumber()), Optional.ofNullable(getDonationId()).map(DonationId::new), year,
                    Year.of(getCertifiedYear()), getIssuedOn(), getIssuedAt(), LocaleCode.fromTag(getLocale()),
                    ReceiptStatus.valueOf(getStatus()), Optional.ofNullable(getSupersededAt()),
                    Optional.ofNullable(getWithdrawnAt()).map(at -> new ReceiptWithdrawal(at, ReceiptWithdrawalReason.valueOf(getWithdrawalReason()))),
                    getGiftCount(), getTotalAmountMinor());
        }
    }

    interface KeptStatus {

        ReceiptStatus getStatus();

        ReceiptWithdrawalReason getWithdrawalReason();
    }

    interface SingleReceiptNumber {

        UUID getDonationId();

        String getNumber();
    }
}
