package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class DonorDeviceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final DonorId JANA = DonorId.newId(NOW);
    private static final DeviceDescription IPHONE_SAFARI = new DeviceDescription(DevicePlatform.IPHONE, DeviceBrowser.SAFARI);

    @Test
    @DisplayName("Given a sign-in, when the device is created, then it is active and last used at the sign-in")
    void should_be_active_and_last_used_at_sign_in_when_created_given_sign_in() {
        DonorDevice device = DonorDevice.signIn(JANA, IPHONE_SAFARI, NOW);

        assertThat(device.isActive()).isTrue();
        assertThat(device.belongsTo(JANA)).isTrue();
        assertThat(device.description()).isEqualTo(IPHONE_SAFARI);
        assertThat(device.signedInAt()).isEqualTo(NOW);
        assertThat(device.lastUsedAt()).isEqualTo(NOW);
        assertThat(device.endedAt()).isEmpty();
        assertThat(device.endReason()).isEmpty();
    }

    @Test
    @DisplayName("Given another donor, when the device is asked whom it belongs to, then it does not belong to them")
    void should_not_belong_when_asked_given_another_donor() {
        DonorDevice device = DonorDevice.signIn(JANA, IPHONE_SAFARI, NOW);

        assertThat(device.belongsTo(DonorId.newId(NOW))).isFalse();
    }

    @Test
    @DisplayName("Given a time ending a device without its reason, when it is reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_end_without_reason() {
        assertThatIllegalArgumentException().isThrownBy(() -> DonorDevice.reconstitute(DeviceId.newId(NOW), JANA, IPHONE_SAFARI, NOW, NOW,
                NOW, null));
    }

    @Nested
    @DisplayName("Given an active device")
    class GivenActiveDevice {

        private final DonorDevice device = DonorDevice.signIn(JANA, IPHONE_SAFARI, NOW);

        @Test
        @DisplayName("when it is used later, then it remembers the later use")
        void should_remember_later_use_when_used() {
            device.recordUse(NOW.plusSeconds(600));

            assertThat(device.lastUsedAt()).isEqualTo(NOW.plusSeconds(600));
        }

        @Test
        @DisplayName("when a use earlier than the last one arrives, then the last use stays")
        void should_keep_last_use_when_used_earlier() {
            device.recordUse(NOW.plusSeconds(600));
            device.recordUse(NOW.plusSeconds(60));

            assertThat(device.lastUsedAt()).isEqualTo(NOW.plusSeconds(600));
        }

        @Test
        @DisplayName("when it is ended, then it is no longer active and keeps the time and the reason")
        void should_keep_time_and_reason_when_ended() {
            boolean ended = device.end(DeviceSignOutReason.REMOTE_SIGN_OUT, NOW.plusSeconds(60));

            assertThat(ended).isTrue();
            assertThat(device.isActive()).isFalse();
            assertThat(device.endedAt()).contains(NOW.plusSeconds(60));
            assertThat(device.endReason()).contains(DeviceSignOutReason.REMOTE_SIGN_OUT);
        }

        @Test
        @DisplayName("when it is ended a second time, then the first end stays and the second reports nothing ended")
        void should_keep_first_end_when_ended_twice() {
            device.end(DeviceSignOutReason.SIGNED_OUT, NOW.plusSeconds(60));

            boolean endedAgain = device.end(DeviceSignOutReason.CREDENTIALS_CHANGED, NOW.plusSeconds(120));

            assertThat(endedAgain).isFalse();
            assertThat(device.endedAt()).contains(NOW.plusSeconds(60));
            assertThat(device.endReason()).contains(DeviceSignOutReason.SIGNED_OUT);
        }

        @Test
        @DisplayName("when it is used after it ended, then the last use stays")
        void should_keep_last_use_when_used_after_end() {
            device.end(DeviceSignOutReason.SIGNED_OUT, NOW.plusSeconds(60));

            device.recordUse(NOW.plusSeconds(600));

            assertThat(device.lastUsedAt()).isEqualTo(NOW);
        }
    }
}
