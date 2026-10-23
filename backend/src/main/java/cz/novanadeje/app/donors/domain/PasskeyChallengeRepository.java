package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;

public interface PasskeyChallengeRepository {

    void save(PasskeyChallenge challenge);

    Optional<PasskeyChallenge> findByChallengeHash(String challengeHash);

    void deleteExpiredAt(Instant now);
}
