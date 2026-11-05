package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DeviceSignOutsTest {

    private static final Instant SIGNED_IN = Instant.parse("2026-11-01T08:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final DonorId JANA = DonorId.newId(SIGNED_IN);

    @Mock
    private DonorDeviceRepository devices;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private ApplicationEventPublisher events;

    private DeviceSignOuts signOuts() {
        return new DeviceSignOuts(devices, refreshTokens, events);
    }

    private static DonorDevice device() {
        return DonorDevice.signIn(JANA, DeviceDescription.UNKNOWN, SIGNED_IN);
    }

    @Test
    @DisplayName("Given two signed-in devices, when every session of the donor ends, then every token is revoked and each device ends with the reason and is announced")
    void should_revoke_every_token_and_end_each_device_when_all_end_given_two_devices() {
        DonorDevice phone = device();
        DonorDevice laptop = device();
        when(devices.findActiveOf(JANA)).thenReturn(List.of(phone, laptop));

        signOuts().endAllOf(JANA, DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);

        InOrder order = inOrder(refreshTokens, devices, events);
        order.verify(refreshTokens).revokeAllOf(JANA, NOW);
        order.verify(refreshTokens).revokeAllOfDevice(phone.id(), NOW);
        order.verify(devices).save(phone);
        order.verify(events).publishEvent(new DeviceSignedOut(JANA.value(), phone.id().value(), NOW));
        order.verify(refreshTokens).revokeAllOfDevice(laptop.id(), NOW);
        order.verify(devices).save(laptop);
        order.verify(events).publishEvent(new DeviceSignedOut(JANA.value(), laptop.id().value(), NOW));
        assertThat(phone.endReason()).contains(DeviceSignOutReason.CREDENTIALS_CHANGED);
        assertThat(laptop.endReason()).contains(DeviceSignOutReason.CREDENTIALS_CHANGED);
    }

    @Test
    @DisplayName("Given the device that changed the password and another, when every session ends but that device's, then every token is revoked and only the other device ends")
    void should_revoke_every_token_and_end_only_other_device_when_all_end_given_continuing_device() {
        DonorDevice continuing = device();
        DonorDevice other = device();
        when(devices.findActiveOf(JANA)).thenReturn(List.of(continuing, other));

        signOuts().endAllOf(JANA, Optional.of(continuing.id()), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);

        verify(refreshTokens).revokeAllOf(JANA, NOW);
        assertThat(continuing.isActive()).isTrue();
        verify(refreshTokens, never()).revokeAllOfDevice(continuing.id(), NOW);
        assertThat(other.endReason()).contains(DeviceSignOutReason.CREDENTIALS_CHANGED);
        verify(events).publishEvent(new DeviceSignedOut(JANA.value(), other.id().value(), NOW));
    }

    @Test
    @DisplayName("Given the current device and another, when the others are signed out, then only the other ends, remotely, and the connected applications keep their tokens")
    void should_end_only_other_device_and_keep_connected_apps_when_others_signed_out_given_current_device() {
        DonorDevice current = device();
        DonorDevice other = device();
        when(devices.findActiveOf(JANA)).thenReturn(List.of(current, other));

        signOuts().endOthersOf(JANA, Optional.of(current.id()), NOW);

        verify(refreshTokens).revokeDevicelessBrowserTokensOf(JANA, NOW);
        verify(refreshTokens, never()).revokeAllOf(any(), any());
        verify(refreshTokens, never()).revokeAllOfDevice(current.id(), NOW);
        verify(refreshTokens).revokeAllOfDevice(other.id(), NOW);
        assertThat(current.isActive()).isTrue();
        assertThat(other.endReason()).contains(DeviceSignOutReason.REMOTE_SIGN_OUT);
        verify(events).publishEvent(new DeviceSignedOut(JANA.value(), other.id().value(), NOW));
    }

    @Test
    @DisplayName("Given a session without a device of its own, when the others are signed out, then every device ends")
    void should_end_every_device_when_others_signed_out_given_no_current_device() {
        DonorDevice phone = device();
        when(devices.findActiveOf(JANA)).thenReturn(List.of(phone));

        signOuts().endOthersOf(JANA, Optional.empty(), NOW);

        assertThat(phone.endReason()).contains(DeviceSignOutReason.REMOTE_SIGN_OUT);
    }

    @Test
    @DisplayName("Given a device that already ended, when it is ended again, then its tokens are revoked but nothing is saved or announced")
    void should_announce_nothing_when_ended_given_device_already_ended() {
        DonorDevice ended = device();
        ended.end(DeviceSignOutReason.SIGNED_OUT, SIGNED_IN.plusSeconds(60));

        signOuts().end(ended, DeviceSignOutReason.REMOTE_SIGN_OUT, NOW);

        verify(refreshTokens).revokeAllOfDevice(ended.id(), NOW);
        verify(devices, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
        assertThat(ended.endReason()).contains(DeviceSignOutReason.SIGNED_OUT);
    }
}
