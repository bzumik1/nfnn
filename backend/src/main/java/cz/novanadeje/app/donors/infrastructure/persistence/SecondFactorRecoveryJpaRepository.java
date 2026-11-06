package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

interface SecondFactorRecoveryJpaRepository extends JpaRepository<SecondFactorRecoveryJpaEntity, UUID> {

    Optional<SecondFactorRecoveryJpaEntity> findByCodeHash(String codeHash);

    Optional<SecondFactorRecoveryJpaEntity> findFirstByDonorIdAndUsedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(UUID donorId, Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from SecondFactorRecoveryJpaEntity r where r.donorId = :donorId and r.usedAt is null")
    int deleteOpenOf(@Param("donorId") UUID donorId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SecondFactorRecoveryJpaEntity r set r.usedAt = :at, r.code = null where r.id = :id and r.usedAt is null")
    int markUsed(@Param("id") UUID id, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SecondFactorRecoveryJpaEntity r set r.code = null where r.code is not null and (r.usedAt is not null or r.expiresAt <= :now)")
    int forgetCodesClosedAt(@Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from SecondFactorRecoveryJpaEntity r where r.expiresAt < :cutoff")
    int deleteExpiredBefore(@Param("cutoff") Instant cutoff);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(nativeQuery = true, value = "delete from donor_second_factor_recovery where id in"
            + " (select id from donor_second_factor_recovery where donor_id = :donorId for update skip locked)")
    int deleteUnlockedOf(@Param("donorId") UUID donorId);
}
