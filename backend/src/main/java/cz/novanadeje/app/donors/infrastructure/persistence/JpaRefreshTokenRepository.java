package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

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
    public Optional<RefreshToken> findById(UUID id) {
        return jpa.findById(id).map(RefreshTokenJpaEntity::toDomain);
    }

    @Override
    public Optional<RefreshToken> findBySecretHashForUpdate(String secretHash) {
        return jpa.findForUpdateBySecretHash(secretHash).map(RefreshTokenJpaEntity::toDomain);
    }

    @Override
    public void recordSuccessor(UUID tokenId, UUID successorId) {
        jpa.recordSuccessor(tokenId, successorId);
    }

    @Override
    public boolean revokeIfUnused(UUID tokenId, Instant at) {
        return jpa.revokeIfUnused(tokenId, at) == 1;
    }

    @Override
    public boolean supersedeIfUnused(UUID tokenId, Instant at) {
        return jpa.supersedeIfUnused(tokenId, at) == 1;
    }

    @Override
    public boolean markUsed(UUID tokenId, Instant at) {
        return jpa.markUsed(tokenId, at) == 1;
    }

    @Override
    public List<RefreshToken> findUsableClientTokensOf(DonorId donorId, Instant now) {
        return jpa.findUsableClientTokensOf(donorId.value(), now).stream().map(RefreshTokenJpaEntity::toDomain).toList();
    }

    @Override
    public void lockAllOf(DonorId donorId) {
        jpa.lockAllOfInIdOrder(donorId.value());
    }

    @Override
    public void revokeAllOf(DonorId donorId, Instant at) {
        jpa.lockAllOfInIdOrder(donorId.value());
        jpa.revokeAllOf(donorId.value(), at);
    }

    @Override
    public void revokeAllOfDevice(DeviceId deviceId, Instant at) {
        jpa.revokeAllOfDevice(deviceId.value(), at);
    }

    @Override
    public void revokeDevicelessBrowserTokensOf(DonorId donorId, Instant at) {
        jpa.revokeDevicelessBrowserTokensOf(donorId.value(), at);
    }

    @Override
    public int deleteSpentBefore(Instant cutoff) {
        return jpa.deleteSpentBefore(cutoff);
    }
}
