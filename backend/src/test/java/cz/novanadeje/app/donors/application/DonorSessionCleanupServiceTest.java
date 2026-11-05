package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.DonorSessionCleanupService.SessionCleanup;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
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
    private DeviceSignOuts signOuts;

    @Test
    @DisplayName("Given a device whose tokens all expired, spent tokens and old ended devices, when the cleanup runs, then the device ends as expired and the old rows go")
    void should_end_expired_device_and_delete_old_rows_when_run_given_spent_sessions() {
        DonorDevice idle = DonorDevice.signIn(JANA, DeviceDescription.UNKNOWN, NOW.minus(Duration.ofDays(20)));
        when(devices.findActiveWithoutUsableTokenAt(NOW)).thenReturn(List.of(idle));
        when(refreshTokens.deleteSpentBefore(NOW.minus(Duration.ofDays(30)))).thenReturn(7);
        when(devices.deleteEndedBefore(NOW.minus(Duration.ofDays(400)))).thenReturn(2);

        SessionCleanup cleanup = new DonorSessionCleanupService(devices, refreshTokens, signOuts, Clock.fixed(NOW, ZoneOffset.UTC)).cleanUp();

        verify(signOuts).end(idle, DeviceSignOutReason.EXPIRED, NOW);
        assertThat(cleanup).isEqualTo(new SessionCleanup(1, 7, 2));
    }
}
