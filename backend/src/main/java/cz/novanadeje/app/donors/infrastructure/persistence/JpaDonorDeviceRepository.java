package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DeviceWipe;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Repository
class JpaDonorDeviceRepository implements DonorDeviceRepository {

    private final DonorDeviceJpaRepository jpa;

    JpaDonorDeviceRepository(DonorDeviceJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(DonorDevice device) {
        jpa.save(DonorDeviceJpaEntity.fromDomain(device));
    }

    @Override
    public Optional<DonorDevice> findById(DeviceId id) {
        return jpa.findById(id.value()).map(DonorDeviceJpaEntity::toDomain);
    }

    @Override
    public Optional<DonorDevice> findByStatusSecretHash(String statusSecretHash) {
        return jpa.findByStatusSecretHash(statusSecretHash).map(DonorDeviceJpaEntity::toDomain);
    }

    @Override
    public void directWipe(DeviceId id, DeviceWipe wipe) {
        jpa.directWipe(id.value(), wipe);
    }

    @Override
    public void directWipeOfDonor(DonorId donorId, DeviceWipe wipe) {
        jpa.directWipeOfDonor(donorId.value(), wipe);
    }

    @Override
    public void reduceErasedOf(DonorId donorId, Instant at) {
        jpa.reduceErasedOf(donorId.value(), at);
    }

    @Override
    public boolean endIfActive(DeviceId id, DeviceSignOutReason reason, Instant at) {
        return jpa.endIfActive(id.value(), reason, at) == 1;
    }

    @Override
    public List<DonorDevice> findSignedInOf(DonorId donorId, Instant now) {
        return jpa.findSignedInOf(donorId.value(), now).stream().map(DonorDeviceJpaEntity::toDomain).toList();
    }

    @Override
    public List<DonorDevice> findActiveOf(DonorId donorId) {
        return jpa.findActiveOf(donorId.value()).stream().map(DonorDeviceJpaEntity::toDomain).toList();
    }

    @Override
    public boolean isSignedIn(DeviceId id, Instant now) {
        return jpa.isSignedIn(id.value(), now);
    }

    @Override
    public Set<DeviceId> signedInAmong(Collection<DeviceId> ids, Instant now) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        return jpa.findSignedInAmong(ids.stream().map(DeviceId::value).toList(), now).stream().map(DeviceId::new)
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public List<DonorDevice> findActiveWithoutUsableTokenAt(Instant now) {
        return jpa.findActiveWithoutUsableTokenAt(now).stream().map(DonorDeviceJpaEntity::toDomain).toList();
    }

    @Override
    public int deleteEndedBefore(Instant cutoff) {
        return jpa.deleteEndedBefore(cutoff);
    }
}
