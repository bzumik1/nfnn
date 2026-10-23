package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface SecondFactorChallengeRepository {

    void save(SecondFactorChallenge challenge);

    Optional<SecondFactorChallenge> findBySecretHash(String secretHash);

    boolean reserveAttempt(UUID challengeId, Instant now, int maxAttempts);

    boolean markUsed(UUID challengeId, Instant at);
}
