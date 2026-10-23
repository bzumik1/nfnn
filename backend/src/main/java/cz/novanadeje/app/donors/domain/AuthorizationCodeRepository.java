package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface AuthorizationCodeRepository {

    void save(AuthorizationCode code);

    Optional<AuthorizationCode> findBySecretHash(String secretHash);

    boolean markUsed(UUID codeId, Instant at);
}
