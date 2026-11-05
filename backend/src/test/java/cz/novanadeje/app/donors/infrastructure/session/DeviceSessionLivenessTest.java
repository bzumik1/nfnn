package cz.novanadeje.app.donors.infrastructure.session;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DeviceSessionLivenessTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final DeviceId PHONE = DeviceId.newId(NOW);

    @Mock
    private DonorDeviceRepository devices;

    private final MutableClock clock = new MutableClock(NOW, ZoneOffset.UTC);

    @Nested
    @DisplayName("Given a signed-in device asked about once")
    class GivenDeviceAskedOnce {

        private DeviceSessionLiveness liveness;

        private void askOnce() {
            when(devices.isSignedIn(any(), any())).thenReturn(true);
            liveness = new DeviceSessionLiveness(devices, clock);
            assertThat(liveness.isLive(PHONE.value())).isTrue();
        }

        @Test
        @DisplayName("when it is asked about again within 30 seconds, then the answer comes without reading the database")
        void should_answer_from_cache_when_asked_within_window() {
            askOnce();
            clock.advance(Duration.ofSeconds(29));

            assertThat(liveness.isLive(PHONE.value())).isTrue();

            verify(devices, times(1)).isSignedIn(PHONE, NOW);
        }

        @Test
        @DisplayName("when it is asked about after 30 seconds, then the database is read again")
        void should_read_again_when_asked_after_window() {
            askOnce();
            clock.advance(Duration.ofSeconds(30));

            liveness.isLive(PHONE.value());

            verify(devices).isSignedIn(PHONE, NOW.plusSeconds(30));
        }

        @Test
        @DisplayName("when the device is signed out, then the next question reads the database and the token is refused at once")
        void should_refuse_at_once_when_signed_out_within_window() {
            askOnce();
            when(devices.isSignedIn(PHONE, NOW.plusSeconds(1))).thenReturn(false);
            clock.advance(Duration.ofSeconds(1));

            liveness.forget(new DeviceSignedOut(UUID.randomUUID(), PHONE.value(), NOW.plusSeconds(1)));

            assertThat(liveness.isLive(PHONE.value())).isFalse();
        }
    }
}
