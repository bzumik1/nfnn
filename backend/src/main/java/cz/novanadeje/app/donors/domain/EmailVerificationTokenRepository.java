package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationTokenRepository {

    void save(EmailVerificationToken token);

    Optional<EmailVerificationToken> findBySecretHash(String secretHash);

    int countOf(DonorId donorId);

    void deleteUnusableOf(DonorId donorId, Instant now);

    boolean markUsed(UUID tokenId, Instant at);

    void deleteAllOf(DonorId donorId);
}
