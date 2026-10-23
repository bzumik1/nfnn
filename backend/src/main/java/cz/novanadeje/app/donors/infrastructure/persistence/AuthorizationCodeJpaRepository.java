package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface AuthorizationCodeJpaRepository extends JpaRepository<AuthorizationCodeJpaEntity, UUID> {

    Optional<AuthorizationCodeJpaEntity> findBySecretHash(String secretHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update AuthorizationCodeJpaEntity c set c.usedAt = :at where c.id = :id and c.usedAt is null")
    int markUsed(@Param("id") UUID id, @Param("at") Instant at);
}
