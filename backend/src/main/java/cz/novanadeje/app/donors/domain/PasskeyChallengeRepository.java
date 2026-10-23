package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface PasskeyChallengeRepository {

    void save(PasskeyChallenge challenge);

    Optional<PasskeyChallenge> findByChallengeHash(String challengeHash);

    boolean markUsed(UUID challengeId, Instant at);

    void deleteExpiredAt(Instant now);
}
