package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.PasskeyChallenge;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
class JpaPasskeyChallengeRepository implements PasskeyChallengeRepository {

    private final PasskeyChallengeJpaRepository jpa;

    JpaPasskeyChallengeRepository(PasskeyChallengeJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(PasskeyChallenge challenge) {
        jpa.save(PasskeyChallengeJpaEntity.fromDomain(challenge));
    }

    @Override
    public Optional<PasskeyChallenge> findByChallengeHash(String challengeHash) {
        return jpa.findByChallengeHash(challengeHash).map(PasskeyChallengeJpaEntity::toDomain);
    }

    @Override
    public void deleteExpiredAt(Instant now) {
        jpa.deleteExpiredAt(now);
    }
}
