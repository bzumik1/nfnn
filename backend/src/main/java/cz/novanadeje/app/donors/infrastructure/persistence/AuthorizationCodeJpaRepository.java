package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AuthorizationCodeJpaRepository extends JpaRepository<AuthorizationCodeJpaEntity, UUID> {

    Optional<AuthorizationCodeJpaEntity> findBySecretHash(String secretHash);
}
