package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface PasswordResetTokenRepository {

    void save(PasswordResetToken token);

    Optional<PasswordResetToken> findBySecretHash(String secretHash);

    int countOf(DonorId donorId);

    void deleteUnusableOf(DonorId donorId, Instant now);

    boolean markUsed(UUID tokenId, Instant at);

    void deleteOthersOf(DonorId donorId, UUID keptTokenId);

    void deleteAllOf(DonorId donorId);
}
