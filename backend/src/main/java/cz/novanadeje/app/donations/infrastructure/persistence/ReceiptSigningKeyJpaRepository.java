package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

interface ReceiptSigningKeyJpaRepository extends JpaRepository<ReceiptSigningKeyJpaEntity, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select signingKey from ReceiptSigningKeyJpaEntity signingKey where signingKey.keyId = :keyId")
    Optional<ReceiptSigningKeyJpaEntity> findForUpdate(@Param("keyId") String keyId);

    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select signingKey from ReceiptSigningKeyJpaEntity signingKey where signingKey.keyId = :keyId")
    Optional<ReceiptSigningKeyJpaEntity> findForShare(@Param("keyId") String keyId);
}
