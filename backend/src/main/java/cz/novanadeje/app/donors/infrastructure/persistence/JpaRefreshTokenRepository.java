package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
class JpaRefreshTokenRepository implements RefreshTokenRepository {

    private final RefreshTokenJpaRepository jpa;

    JpaRefreshTokenRepository(RefreshTokenJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(RefreshToken token) {
        jpa.save(RefreshTokenJpaEntity.fromDomain(token));
    }

    @Override
    public Optional<RefreshToken> findBySecretHash(String secretHash) {
        return jpa.findBySecretHash(secretHash).map(RefreshTokenJpaEntity::toDomain);
    }

    @Override
    public void revokeAllOf(DonorId donorId, Instant at) {
        jpa.revokeAllOf(donorId.value(), at);
    }
}
