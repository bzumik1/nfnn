package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.DonorSessionCleanupService.SessionCleanup;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.AuthorizationCodeRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorSessionCleanupServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T03:10:00Z");
    private static final DonorId JANA = DonorId.newId(NOW);

    @Mock
    private DonorDeviceRepository devices;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private SecondFactorChallengeRepository challenges;
    @Mock
    private AuthorizationCodeRepository authorizationCodes;
    @Mock
    private SecondFactorRecoveryRepository recoveries;
    @Mock
    private DeviceSignOuts signOuts;

    @Test
    @DisplayName("Given a device whose tokens all expired, one another sign-out ended meanwhile, spent tokens and old ended devices, when the cleanup runs, then the device ends as expired, only it is counted and the old rows go")
    void should_end_expired_device_and_delete_old_rows_when_run_given_spent_sessions() {
        DonorDevice idle = DonorDevice.signIn(JANA, DeviceDescription.UNKNOWN, SessionKind.REMEMBERED, NOW.minus(Duration.ofDays(20)));
        DonorDevice endedMeanwhile = DonorDevice.signIn(JANA, DeviceDescription.UNKNOWN, SessionKind.REMEMBERED, NOW.minus(Duration.ofDays(20)));
        when(devices.findActiveWithoutUsableTokenAt(NOW)).thenReturn(List.of(idle, endedMeanwhile));
        when(signOuts.end(JANA, idle.id(), DeviceSignOutReason.EXPIRED, NOW)).thenReturn(true);
        when(signOuts.end(JANA, endedMeanwhile.id(), DeviceSignOutReason.EXPIRED, NOW)).thenReturn(false);
        when(refreshTokens.deleteSpentBefore(NOW.minus(Duration.ofDays(30)))).thenReturn(7);
        when(devices.deleteEndedBefore(NOW.minus(Duration.ofDays(400)))).thenReturn(2);

        SessionCleanup cleanup = service().cleanUp();

        assertThat(cleanup).isEqualTo(new SessionCleanup(1, 7, 2));
    }

    @Test
    @DisplayName("Given spent second-factor challenges, authorization codes and recoveries, when the cleanup runs, then the codes of closed recoveries are forgotten and every one-time secret that expired more than 30 days ago is deleted before any device is ended")
    void should_forget_closed_recovery_codes_and_delete_old_one_time_secrets_before_ending_devices_when_run() {
        service().cleanUp();

        Instant cutoff = NOW.minus(Duration.ofDays(30));
        InOrder order = inOrder(recoveries, challenges, authorizationCodes, devices);
        order.verify(recoveries).forgetCodesClosedAt(NOW);
        order.verify(recoveries).deleteExpiredBefore(cutoff);
        order.verify(challenges).deleteExpiredBefore(cutoff);
        order.verify(authorizationCodes).deleteExpiredBefore(cutoff);
        order.verify(devices).findActiveWithoutUsableTokenAt(NOW);
    }

    private DonorSessionCleanupService service() {
        return new DonorSessionCleanupService(devices, refreshTokens, challenges, authorizationCodes, recoveries, signOuts, Clock.fixed(NOW, ZoneOffset.UTC));
    }
}
