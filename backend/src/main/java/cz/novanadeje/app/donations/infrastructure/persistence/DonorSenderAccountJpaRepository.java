package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface DonorSenderAccountJpaRepository extends JpaRepository<DonorSenderAccountJpaEntity, DonorSenderAccountKey> {

    List<DonorSenderAccountJpaEntity> findByDonorId(UUID donorId);

    List<DonorSenderAccountJpaEntity> findByAccountNumberAndBankCode(String accountNumber, String bankCode);

    @Transactional
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "insert into donor_sender_account (donor_id, account_number, bank_code, learned_from_payment_id, learned_at)"
            + " values (:donorId, :number, :code, :paymentId, :learnedAt) on conflict do nothing")
    int insertIgnoringDuplicate(@Param("donorId") UUID donorId, @Param("number") String number, @Param("code") String code,
                                @Param("paymentId") UUID paymentId, @Param("learnedAt") Instant learnedAt);
}
