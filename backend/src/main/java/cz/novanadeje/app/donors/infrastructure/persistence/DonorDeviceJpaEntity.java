package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DeviceBrowser;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DevicePlatform;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_device")
class DonorDeviceJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "platform", nullable = false, length = 20)
    private DevicePlatform platform;

    @Enumerated(EnumType.STRING)
    @Column(name = "browser", nullable = false, length = 20)
    private DeviceBrowser browser;

    @Column(name = "signed_in_at", nullable = false)
    private Instant signedInAt;

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "end_reason", length = 30)
    private DeviceSignOutReason endReason;

    protected DonorDeviceJpaEntity() {
    }

    static DonorDeviceJpaEntity fromDomain(DonorDevice device) {
        DonorDeviceJpaEntity entity = new DonorDeviceJpaEntity();
        entity.id = device.id().value();
        entity.donorId = device.donorId().value();
        entity.platform = device.description().platform();
        entity.browser = device.description().browser();
        entity.signedInAt = device.signedInAt();
        entity.lastUsedAt = device.lastUsedAt();
        entity.endedAt = device.endedAt().orElse(null);
        entity.endReason = device.endReason().orElse(null);
        return entity;
    }

    DonorDevice toDomain() {
        return DonorDevice.reconstitute(new DeviceId(id), new DonorId(donorId), new DeviceDescription(platform, browser),
                signedInAt, lastUsedAt, endedAt, endReason);
    }
}
