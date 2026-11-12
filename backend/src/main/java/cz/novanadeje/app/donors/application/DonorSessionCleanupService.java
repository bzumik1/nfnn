package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.AuthorizationCodeRepository;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

@Service
public class DonorSessionCleanupService {

    public static final Duration SPENT_TOKEN_RETENTION = Duration.ofDays(30);
    public static final Duration ENDED_DEVICE_RETENTION = Duration.ofDays(400);
    public static final Duration SPENT_SECRET_RETENTION = Duration.ofDays(30);

    private final DonorDeviceRepository devices;
    private final RefreshTokenRepository refreshTokens;
    private final SecondFactorChallengeRepository challenges;
    private final AuthorizationCodeRepository authorizationCodes;
    private final SecondFactorRecoveryRepository recoveries;
    private final DeviceSignOuts signOuts;
    private final Clock clock;

    public DonorSessionCleanupService(DonorDeviceRepository devices, RefreshTokenRepository refreshTokens, SecondFactorChallengeRepository challenges,
                                      AuthorizationCodeRepository authorizationCodes, SecondFactorRecoveryRepository recoveries, DeviceSignOuts signOuts,
                                      Clock clock) {
        this.devices = devices;
        this.refreshTokens = refreshTokens;
        this.challenges = challenges;
        this.authorizationCodes = authorizationCodes;
        this.recoveries = recoveries;
        this.signOuts = signOuts;
        this.clock = clock;
    }

    @Transactional
    public SessionCleanup cleanUp() {
        Instant now = clock.instant();
        Instant spentSecretsCutoff = now.minus(SPENT_SECRET_RETENTION);
        recoveries.forgetCodesClosedAt(now);
        recoveries.deleteExpiredBefore(spentSecretsCutoff);
        challenges.deleteExpiredBefore(spentSecretsCutoff);
        authorizationCodes.deleteExpiredBefore(spentSecretsCutoff);
        int expired = (int) devices.findActiveWithoutUsableTokenAt(now).stream()
                .filter(device -> signOuts.end(device.donorId(), device.id(), DeviceSignOutReason.EXPIRED, now))
                .count();
        int tokens = refreshTokens.deleteSpentBefore(now.minus(SPENT_TOKEN_RETENTION));
        int ended = devices.deleteEndedBefore(now.minus(ENDED_DEVICE_RETENTION));
        return new SessionCleanup(expired, tokens, ended);
    }

    public record SessionCleanup(int expiredDevices, int deletedTokens, int deletedDevices) {
    }
}
