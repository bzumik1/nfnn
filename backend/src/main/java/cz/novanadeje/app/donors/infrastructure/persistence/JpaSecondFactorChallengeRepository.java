package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.SecondFactorChallenge;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaSecondFactorChallengeRepository implements SecondFactorChallengeRepository {

    private final SecondFactorChallengeJpaRepository jpa;

    JpaSecondFactorChallengeRepository(SecondFactorChallengeJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(SecondFactorChallenge challenge) {
        jpa.save(SecondFactorChallengeJpaEntity.fromDomain(challenge));
    }

    @Override
    public Optional<SecondFactorChallenge> findBySecretHash(String secretHash) {
        return jpa.findBySecretHash(secretHash).map(SecondFactorChallengeJpaEntity::toDomain);
    }
}
