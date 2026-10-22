package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

interface SecondFactorChallengeJpaRepository extends JpaRepository<SecondFactorChallengeJpaEntity, UUID> {

    Optional<SecondFactorChallengeJpaEntity> findBySecretHash(String secretHash);
}
