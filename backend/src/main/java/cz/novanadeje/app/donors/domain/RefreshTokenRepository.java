package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;

public interface RefreshTokenRepository {

    void save(RefreshToken token);

    Optional<RefreshToken> findBySecretHash(String secretHash);

    void revokeAllOf(DonorId donorId, Instant at);
}
