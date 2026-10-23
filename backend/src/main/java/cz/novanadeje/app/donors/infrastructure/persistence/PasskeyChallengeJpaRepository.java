package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

interface PasskeyChallengeJpaRepository extends JpaRepository<PasskeyChallengeJpaEntity, UUID> {

    Optional<PasskeyChallengeJpaEntity> findByChallengeHash(String challengeHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PasskeyChallengeJpaEntity challenge where challenge.expiresAt <= :now")
    int deleteExpiredAt(@Param("now") Instant now);
}
