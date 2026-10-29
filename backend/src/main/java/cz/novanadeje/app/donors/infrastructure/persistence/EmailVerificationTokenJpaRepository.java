package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

interface EmailVerificationTokenJpaRepository extends JpaRepository<EmailVerificationTokenJpaEntity, UUID> {

    Optional<EmailVerificationTokenJpaEntity> findBySecretHash(String secretHash);

    int countByDonorId(UUID donorId);

    Optional<EmailVerificationTokenJpaEntity> findFirstByDonorIdAndNewEmailIsNotNullAndUsedAtIsNullAndExpiresAtGreaterThanOrderByIssuedAtDesc(
            UUID donorId, Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from EmailVerificationTokenJpaEntity t where t.donorId = :donorId and t.newEmail is not null")
    int deleteChangeLinksOfDonor(@Param("donorId") UUID donorId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from EmailVerificationTokenJpaEntity t where t.donorId = :donorId and (t.usedAt is not null or t.expiresAt <= :now)")
    int deleteUnusable(@Param("donorId") UUID donorId, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update EmailVerificationTokenJpaEntity t set t.usedAt = :at where t.id = :id and t.usedAt is null and t.expiresAt > :at")
    int markUsed(@Param("id") UUID id, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from EmailVerificationTokenJpaEntity t where t.donorId = :donorId")
    int deleteAllOfDonor(@Param("donorId") UUID donorId);
}
