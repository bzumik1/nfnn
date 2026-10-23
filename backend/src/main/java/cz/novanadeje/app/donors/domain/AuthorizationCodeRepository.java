package cz.novanadeje.app.donors.domain;

import java.util.Optional;

public interface AuthorizationCodeRepository {

    void save(AuthorizationCode code);

    Optional<AuthorizationCode> findBySecretHash(String secretHash);
}
