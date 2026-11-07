package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

interface AuthorizationCodeJpaRepository extends JpaRepository<AuthorizationCodeJpaEntity, UUID> {

    Optional<AuthorizationCodeJpaEntity> findBySecretHash(String secretHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update AuthorizationCodeJpaEntity c set c.usedAt = :at where c.id = :id and c.usedAt is null")
    int markUsed(@Param("id") UUID id, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from AuthorizationCodeJpaEntity c where c.expiresAt < :cutoff")
    int deleteExpiredBefore(@Param("cutoff") Instant cutoff);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(nativeQuery = true, value = "delete from oauth_authorization_code where id in"
            + " (select id from oauth_authorization_code where donor_id = :donorId for update skip locked)")
    int deleteUnlockedOf(@Param("donorId") UUID donorId);
}
