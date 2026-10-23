package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

interface SecondFactorChallengeJpaRepository extends JpaRepository<SecondFactorChallengeJpaEntity, UUID> {

    Optional<SecondFactorChallengeJpaEntity> findBySecretHash(String secretHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SecondFactorChallengeJpaEntity c set c.failedAttempts = c.failedAttempts + 1 where c.id = :id and c.usedAt is null"
            + " and c.expiresAt > :now and c.failedAttempts < :maxAttempts")
    int reserveAttempt(@Param("id") UUID id, @Param("now") Instant now, @Param("maxAttempts") int maxAttempts);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SecondFactorChallengeJpaEntity c set c.usedAt = :at where c.id = :id and c.usedAt is null")
    int markUsed(@Param("id") UUID id, @Param("at") Instant at);
}
