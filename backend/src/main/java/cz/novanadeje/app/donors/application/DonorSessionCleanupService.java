package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
public class DonorSessionCleanupService {

    public static final Duration SPENT_TOKEN_RETENTION = Duration.ofDays(30);
    public static final Duration ENDED_DEVICE_RETENTION = Duration.ofDays(400);

    private final DonorDeviceRepository devices;
    private final RefreshTokenRepository refreshTokens;
    private final DeviceSignOuts signOuts;
    private final Clock clock;

    public DonorSessionCleanupService(DonorDeviceRepository devices, RefreshTokenRepository refreshTokens, DeviceSignOuts signOuts, Clock clock) {
        this.devices = devices;
        this.refreshTokens = refreshTokens;
        this.signOuts = signOuts;
        this.clock = clock;
    }

    @Transactional
    public SessionCleanup cleanUp() {
        Instant now = clock.instant();
        List<DonorDevice> expired = devices.findActiveWithoutUsableTokenAt(now);
        expired.forEach(device -> signOuts.end(device, DeviceSignOutReason.EXPIRED, now));
        int tokens = refreshTokens.deleteSpentBefore(now.minus(SPENT_TOKEN_RETENTION));
        int ended = devices.deleteEndedBefore(now.minus(ENDED_DEVICE_RETENTION));
        return new SessionCleanup(expired.size(), tokens, ended);
    }

    public record SessionCleanup(int expiredDevices, int deletedTokens, int deletedDevices) {
    }
}
