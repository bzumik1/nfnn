package cz.novanadeje.app.donors.domain;

import java.util.Optional;

public interface SecondFactorChallengeRepository {

    void save(SecondFactorChallenge challenge);

    Optional<SecondFactorChallenge> findBySecretHash(String secretHash);
}
