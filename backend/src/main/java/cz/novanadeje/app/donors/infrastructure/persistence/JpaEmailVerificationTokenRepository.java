package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
class JpaEmailVerificationTokenRepository implements EmailVerificationTokenRepository {

    private final EmailVerificationTokenJpaRepository jpa;

    JpaEmailVerificationTokenRepository(EmailVerificationTokenJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(EmailVerificationToken token) {
        jpa.save(EmailVerificationTokenJpaEntity.fromDomain(token));
    }

    @Override
    public Optional<EmailVerificationToken> findBySecretHash(String secretHash) {
        return jpa.findBySecretHash(secretHash).map(EmailVerificationTokenJpaEntity::toDomain);
    }

    @Override
    public int countOf(DonorId donorId) {
        return jpa.countByDonorId(donorId.value());
    }

    @Override
    public void deleteUnusableOf(DonorId donorId, Instant now) {
        jpa.deleteUnusable(donorId.value(), now);
    }

    @Override
    public boolean markUsed(UUID tokenId, Instant at) {
        return jpa.markUsed(tokenId, at) == 1;
    }

    @Override
    public void deleteAllOf(DonorId donorId) {
        jpa.deleteAllOfDonor(donorId.value());
    }
}
