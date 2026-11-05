package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface DonorDeviceRepository {

    void save(DonorDevice device);

    Optional<DonorDevice> findById(DeviceId id);

    boolean endIfActive(DeviceId id, DeviceSignOutReason reason, Instant at);

    List<DonorDevice> findSignedInOf(DonorId donorId, Instant now);

    List<DonorDevice> findActiveOf(DonorId donorId);

    boolean isSignedIn(DeviceId id, Instant now);

    List<DonorDevice> findActiveWithoutUsableTokenAt(Instant now);

    int deleteEndedBefore(Instant cutoff);
}
