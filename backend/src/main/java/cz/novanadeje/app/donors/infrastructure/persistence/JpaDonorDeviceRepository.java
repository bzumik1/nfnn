package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

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
    public List<DonorDevice> findActiveWithoutUsableTokenAt(Instant now) {
        return jpa.findActiveWithoutUsableTokenAt(now).stream().map(DonorDeviceJpaEntity::toDomain).toList();
    }

    @Override
    public int deleteEndedBefore(Instant cutoff) {
        return jpa.deleteEndedBefore(cutoff);
    }
}
