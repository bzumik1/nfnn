package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
class JpaPasswordResetTokenRepository implements PasswordResetTokenRepository {

    private final PasswordResetTokenJpaRepository jpa;

    JpaPasswordResetTokenRepository(PasswordResetTokenJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(PasswordResetToken token) {
        jpa.save(PasswordResetTokenJpaEntity.fromDomain(token));
    }

    @Override
    public Optional<PasswordResetToken> findBySecretHash(String secretHash) {
        return jpa.findBySecretHash(secretHash).map(PasswordResetTokenJpaEntity::toDomain);
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
    public void deleteOthersOf(DonorId donorId, UUID keptTokenId) {
        jpa.deleteOthers(donorId.value(), keptTokenId);
    }

    @Override
    public void deleteAllOf(DonorId donorId) {
        jpa.deleteAllOfDonor(donorId.value());
    }
}
