package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

interface ReceiptSignatoryJpaRepository extends JpaRepository<ReceiptSignatoryJpaEntity, Short> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select signatory from ReceiptSignatoryJpaEntity signatory where signatory.id = :id")
    Optional<ReceiptSignatoryJpaEntity> findLockedById(@Param("id") Short id);
}
