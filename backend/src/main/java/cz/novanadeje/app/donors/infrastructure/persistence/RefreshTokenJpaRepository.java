package cz.novanadeje.app.donors.infrastructure.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface RefreshTokenJpaRepository extends JpaRepository<RefreshTokenJpaEntity, UUID> {

    Optional<RefreshTokenJpaEntity> findBySecretHash(String secretHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RefreshTokenJpaEntity t where t.secretHash = :secretHash")
    Optional<RefreshTokenJpaEntity> findForUpdateBySecretHash(@Param("secretHash") String secretHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update RefreshTokenJpaEntity t set t.successorId = :successorId where t.id = :id")
    int recordSuccessor(@Param("id") UUID id, @Param("successorId") UUID successorId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update RefreshTokenJpaEntity t set t.revokedAt = :at where t.id = :id and t.usedAt is null and t.revokedAt is null")
    int revokeIfUnused(@Param("id") UUID id, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update RefreshTokenJpaEntity t set t.revokedAt = :at, t.supersededAt = :at where t.id = :id and t.usedAt is null and t.revokedAt is null")
    int supersedeIfUnused(@Param("id") UUID id, @Param("at") Instant at);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t.id from RefreshTokenJpaEntity t where t.donorId = :donorId order by t.id")
    List<UUID> lockAllOfInIdOrder(@Param("donorId") UUID donorId);

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
