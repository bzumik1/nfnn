package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

interface ReceiptSignatoryJpaRepository extends JpaRepository<ReceiptSignatoryJpaEntity, Short> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select signatory from ReceiptSignatoryJpaEntity signatory where signatory.id = :id")
    Optional<ReceiptSignatoryJpaEntity> findLockedById(@Param("id") Short id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            insert into donation_receipt_signatory (id, person_id, receipt_role, chosen_at)
            values (:id, :personId, :receiptRole, :chosenAt)
            on conflict (id) do update
            set person_id = excluded.person_id, receipt_role = excluded.receipt_role, chosen_at = excluded.chosen_at""", nativeQuery = true)
    void upsert(@Param("id") Short id, @Param("personId") UUID personId, @Param("receiptRole") String receiptRole,
                @Param("chosenAt") Instant chosenAt);
}
