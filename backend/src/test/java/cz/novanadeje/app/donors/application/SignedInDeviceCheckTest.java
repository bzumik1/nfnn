package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SessionKind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SignedInDeviceCheckTest {

    private static final Instant SIGNED_IN = Instant.parse("2026-11-01T08:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final DonorId JANA = DonorId.newId(SIGNED_IN);
    private static final DonorId PETR = DonorId.newId(SIGNED_IN);

    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private DonorDeviceRepository devices;

    private SignedInDeviceCheck check() {
        return new SignedInDeviceCheck(refreshTokens, devices, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static DonorDevice deviceOf(DonorId donor, SessionKind kind) {
        return DonorDevice.signIn(donor, DeviceDescription.UNKNOWN, kind, SIGNED_IN);
    }

    @Test
    @DisplayName("Given a signed-in device of the donor, when it is held, then the donor's sessions lock is taken before the device is read and its session kind is answered")
    void should_lock_sessions_first_and_answer_the_session_kind_when_held_given_a_signed_in_device() {
        DonorDevice phone = deviceOf(JANA, SessionKind.PUBLIC);
        when(devices.findById(phone.id())).thenReturn(Optional.of(phone));
        when(devices.isSignedIn(phone.id(), NOW)).thenReturn(true);

        Optional<SessionKind> held = check().hold(JANA, phone.id());

        assertThat(held).contains(SessionKind.PUBLIC);
        InOrder order = inOrder(refreshTokens, devices);
        order.verify(refreshTokens).lockSessionsOf(JANA);
        order.verify(devices).findById(phone.id());
    }

    @Test
    @DisplayName("Given a device that is no longer signed in, when it is held, then nothing is answered after the lock")
    void should_answer_nothing_after_the_lock_when_held_given_a_device_no_longer_signed_in() {
        DonorDevice phone = deviceOf(JANA, SessionKind.REMEMBERED);
        when(devices.findById(phone.id())).thenReturn(Optional.of(phone));
        when(devices.isSignedIn(phone.id(), NOW)).thenReturn(false);

        assertThat(check().hold(JANA, phone.id())).isEmpty();
        verify(refreshTokens).lockSessionsOf(JANA);
    }

    @Test
    @DisplayName("Given a signed-in device of another donor, when the donor holds it, then nothing is answered and its sign-in is not asked")
    void should_answer_nothing_when_held_given_a_device_of_another_donor() {
        DonorDevice petrs = deviceOf(PETR, SessionKind.REMEMBERED);
        when(devices.findById(petrs.id())).thenReturn(Optional.of(petrs));

        assertThat(check().hold(JANA, petrs.id())).isEmpty();
        verify(devices, never()).isSignedIn(any(), any());
    }

    @Test
    @DisplayName("Given no device of the id, when it is held, then nothing is answered")
    void should_answer_nothing_when_held_given_no_device_of_the_id() {
        DeviceId unknown = DeviceId.newId(SIGNED_IN);
        when(devices.findById(unknown)).thenReturn(Optional.empty());

        assertThat(check().hold(JANA, unknown)).isEmpty();
    }

    @Test
    @DisplayName("Given devices of which some are signed in, when they are sorted, then the signed-in ones at this moment are answered")
    void should_answer_the_signed_in_ones_now_when_sorted_given_some_signed_in() {
        DeviceId live = DeviceId.newId(SIGNED_IN);
        DeviceId ended = DeviceId.newId(SIGNED_IN);
        when(devices.signedInAmong(List.of(live, ended), NOW)).thenReturn(Set.of(live));

        assertThat(check().signedInAmong(List.of(live, ended))).containsExactly(live);
    }
}
