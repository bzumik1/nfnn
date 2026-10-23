package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository {

    void save(RefreshToken token);

    Optional<RefreshToken> findBySecretHash(String secretHash);

    Optional<RefreshToken> findById(UUID id);

    boolean markUsed(UUID tokenId, Instant at);

    List<RefreshToken> findUsableClientTokensOf(DonorId donorId, Instant now);

    void revokeAllOf(DonorId donorId, Instant at);
}
