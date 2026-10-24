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

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from SecondFactorRecoveryJpaEntity r where r.donorId = :donorId and r.usedAt is null")
    int deleteOpenOf(@Param("donorId") UUID donorId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SecondFactorRecoveryJpaEntity r set r.usedAt = :at where r.id = :id and r.usedAt is null")
    int markUsed(@Param("id") UUID id, @Param("at") Instant at);
}
