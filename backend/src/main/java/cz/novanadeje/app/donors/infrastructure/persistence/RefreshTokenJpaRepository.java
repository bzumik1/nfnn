package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenJpaRepository extends JpaRepository<RefreshTokenJpaEntity, UUID> {

    Optional<RefreshTokenJpaEntity> findBySecretHash(String secretHash);

    @Modifying
    @Query("update RefreshTokenJpaEntity t set t.revokedAt = :at where t.donorId = :donorId and t.revokedAt is null")
    void revokeAllOf(@Param("donorId") UUID donorId, @Param("at") Instant at);
}
