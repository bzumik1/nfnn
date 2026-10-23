package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

interface DonorSenderAccountJpaRepository extends JpaRepository<DonorSenderAccountJpaEntity, UUID> {

    List<DonorSenderAccountJpaEntity> findByDonorIdOrderByCreatedAtAscIdAsc(UUID donorId);

    List<DonorSenderAccountJpaEntity> findByAccountNumberAndBankCode(String accountNumber, String bankCode);

    @Transactional
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "insert into donor_sender_account (id, donor_id, account_number, bank_code, status,"
            + " learned_from_payment_id, learned_at, valid_from, valid_to, created_at, disconnected_at)"
            + " values (:id, :donorId, :number, :code, :status, :paymentId, :learnedAt, :validFrom, :validTo, :createdAt, :disconnectedAt)"
            + " on conflict (donor_id, account_number, bank_code) where status <> 'DISCONNECTED' do nothing")
    int insertIgnoringLiveDuplicate(@Param("id") UUID id, @Param("donorId") UUID donorId, @Param("number") String number,
                                    @Param("code") String code, @Param("status") String status, @Param("paymentId") UUID paymentId,
                                    @Param("learnedAt") Instant learnedAt, @Param("validFrom") LocalDate validFrom,
                                    @Param("validTo") LocalDate validTo, @Param("createdAt") Instant createdAt,
                                    @Param("disconnectedAt") Instant disconnectedAt);
}
