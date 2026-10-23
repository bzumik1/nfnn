package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface RefreshTokenJpaRepository extends JpaRepository<RefreshTokenJpaEntity, UUID> {

    Optional<RefreshTokenJpaEntity> findBySecretHash(String secretHash);

    @Query("select t from RefreshTokenJpaEntity t where t.donorId = :donorId and t.clientId is not null and t.usedAt is null"
            + " and t.revokedAt is null and t.expiresAt > :now order by t.issuedAt desc")
    List<RefreshTokenJpaEntity> findUsableClientTokensOf(@Param("donorId") UUID donorId, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update RefreshTokenJpaEntity t set t.usedAt = :at where t.id = :id and t.usedAt is null")
    int markUsed(@Param("id") UUID id, @Param("at") Instant at);

    @Modifying
    @Query("update RefreshTokenJpaEntity t set t.revokedAt = :at where t.donorId = :donorId and t.revokedAt is null")
    void revokeAllOf(@Param("donorId") UUID donorId, @Param("at") Instant at);
}
