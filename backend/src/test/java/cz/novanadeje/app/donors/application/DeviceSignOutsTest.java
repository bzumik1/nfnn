package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.SessionKind;
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
        return DonorDevice.signIn(JANA, DeviceDescription.UNKNOWN, SessionKind.REMEMBERED, SIGNED_IN);
    }

    @Test
    @DisplayName("Given two signed-in devices, when every session of the donor ends, then every token is revoked and each device ends with the reason and is announced")
    void should_revoke_every_token_and_end_each_device_when_all_end_given_two_devices() {
        DonorDevice phone = device();
        DonorDevice laptop = device();
        when(devices.findActiveOf(JANA)).thenReturn(List.of(phone, laptop));
        when(devices.endIfActive(phone.id(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW)).thenReturn(true);
        when(devices.endIfActive(laptop.id(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW)).thenReturn(true);

        signOuts().endAllOf(JANA, DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);

        InOrder order = inOrder(refreshTokens, devices, events);
        order.verify(refreshTokens).lockSessionsOf(JANA);
        order.verify(refreshTokens).revokeAllOf(JANA, NOW);
        order.verify(devices).findActiveOf(JANA);
        order.verify(refreshTokens).revokeAllOfDevice(phone.id(), NOW);
        order.verify(devices).endIfActive(phone.id(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
        order.verify(events).publishEvent(new DeviceSignedOut(JANA.value(), phone.id().value(), NOW));
        order.verify(refreshTokens).revokeAllOfDevice(laptop.id(), NOW);
        order.verify(devices).endIfActive(laptop.id(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
        order.verify(events).publishEvent(new DeviceSignedOut(JANA.value(), laptop.id().value(), NOW));
    }

    @Test
    @DisplayName("Given the device that changed the password and another, when every session ends but that device's, then every token is revoked and only the other device ends")
    void should_revoke_every_token_and_end_only_other_device_when_all_end_given_continuing_device() {
        DonorDevice continuing = device();
        DonorDevice other = device();
        when(devices.findActiveOf(JANA)).thenReturn(List.of(continuing, other));
        when(devices.endIfActive(other.id(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW)).thenReturn(true);

        signOuts().endAllOf(JANA, Optional.of(continuing.id()), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);

        verify(refreshTokens).revokeAllOf(JANA, NOW);
        verify(refreshTokens, never()).revokeAllOfDevice(continuing.id(), NOW);
        verify(devices, never()).endIfActive(continuing.id(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
        verify(events).publishEvent(new DeviceSignedOut(JANA.value(), other.id().value(), NOW));
    }

    @Test
    @DisplayName("Given the current device and another, when the others are signed out, then the donor's tokens are locked first, only the other ends, remotely, and the connected applications keep their tokens")
    void should_end_only_other_device_and_keep_connected_apps_when_others_signed_out_given_current_device() {
        DonorDevice current = device();
        DonorDevice other = device();
        when(devices.findActiveOf(JANA)).thenReturn(List.of(current, other));
        when(devices.endIfActive(other.id(), DeviceSignOutReason.REMOTE_SIGN_OUT, NOW)).thenReturn(true);

        signOuts().endOthersOf(JANA, Optional.of(current.id()), NOW);

        InOrder order = inOrder(refreshTokens, devices);
        order.verify(refreshTokens).lockSessionsOf(JANA);
        order.verify(refreshTokens).lockAllOf(JANA);
        order.verify(refreshTokens).revokeDevicelessBrowserTokensOf(JANA, NOW);
        order.verify(devices).findActiveOf(JANA);
        verify(refreshTokens, never()).revokeAllOf(any(), any());
        verify(refreshTokens, never()).revokeAllOfDevice(current.id(), NOW);
        verify(refreshTokens).revokeAllOfDevice(other.id(), NOW);
        verify(devices, never()).endIfActive(current.id(), DeviceSignOutReason.REMOTE_SIGN_OUT, NOW);
        verify(events).publishEvent(new DeviceSignedOut(JANA.value(), other.id().value(), NOW));
    }

    @Test
    @DisplayName("Given a session without a device of its own, when the others are signed out, then every device ends")
    void should_end_every_device_when_others_signed_out_given_no_current_device() {
        DonorDevice phone = device();
        when(devices.findActiveOf(JANA)).thenReturn(List.of(phone));
        when(devices.endIfActive(phone.id(), DeviceSignOutReason.REMOTE_SIGN_OUT, NOW)).thenReturn(true);

        signOuts().endOthersOf(JANA, Optional.empty(), NOW);

        verify(events).publishEvent(new DeviceSignedOut(JANA.value(), phone.id().value(), NOW));
    }

    @Test
    @DisplayName("Given a signed-in device, when it is ended, then the donor's tokens are locked before the device is read, its tokens are revoked and it ends and is announced")
    void should_lock_then_end_and_announce_when_ended_given_active_device() {
        DonorDevice phone = device();
        when(devices.findById(phone.id())).thenReturn(Optional.of(phone));
        when(devices.endIfActive(phone.id(), DeviceSignOutReason.REMOTE_SIGN_OUT, NOW)).thenReturn(true);

        boolean ended = signOuts().end(JANA, phone.id(), DeviceSignOutReason.REMOTE_SIGN_OUT, NOW);

        assertThat(ended).isTrue();
        InOrder order = inOrder(refreshTokens, devices, events);
        order.verify(refreshTokens).lockSessionsOf(JANA);
        order.verify(refreshTokens).lockAllOf(JANA);
        order.verify(devices).findById(phone.id());
        order.verify(refreshTokens).revokeAllOfDevice(phone.id(), NOW);
        order.verify(devices).endIfActive(phone.id(), DeviceSignOutReason.REMOTE_SIGN_OUT, NOW);
        order.verify(events).publishEvent(new DeviceSignedOut(JANA.value(), phone.id().value(), NOW));
    }

    @Test
    @DisplayName("Given a device another sign-out ended after it was read, when it is ended, then nothing is announced and the answer is false")
    void should_announce_nothing_when_ended_given_device_ended_meanwhile() {
        DonorDevice phone = device();
        when(devices.findById(phone.id())).thenReturn(Optional.of(phone));
        when(devices.endIfActive(phone.id(), DeviceSignOutReason.EXPIRED, NOW)).thenReturn(false);

        boolean ended = signOuts().end(JANA, phone.id(), DeviceSignOutReason.EXPIRED, NOW);

        assertThat(ended).isFalse();
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given a device that already ended, when it is ended again, then nothing is revoked, ended or announced")
    void should_change_nothing_when_ended_given_device_already_ended() {
        DonorDevice ended = device();
        ended.end(DeviceSignOutReason.SIGNED_OUT, SIGNED_IN.plusSeconds(60));
        when(devices.findById(ended.id())).thenReturn(Optional.of(ended));

        boolean result = signOuts().end(JANA, ended.id(), DeviceSignOutReason.REMOTE_SIGN_OUT, NOW);

        assertThat(result).isFalse();
        verify(refreshTokens, never()).revokeAllOfDevice(any(), any());
        verify(devices, never()).endIfActive(any(), any(), any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given another donor's device, when it is ended for Jana, then nothing is revoked, ended or announced")
    void should_change_nothing_when_ended_given_another_donors_device() {
        DonorDevice petrs = DonorDevice.signIn(DonorId.newId(SIGNED_IN), DeviceDescription.UNKNOWN, SessionKind.REMEMBERED, SIGNED_IN);
        when(devices.findById(petrs.id())).thenReturn(Optional.of(petrs));

        boolean result = signOuts().end(JANA, petrs.id(), DeviceSignOutReason.REMOTE_SIGN_OUT, NOW);

        assertThat(result).isFalse();
        verify(refreshTokens, never()).revokeAllOfDevice(any(), any());
        verify(devices, never()).endIfActive(any(), any(), any());
        verify(events, never()).publishEvent(any(Object.class));
    }
}
