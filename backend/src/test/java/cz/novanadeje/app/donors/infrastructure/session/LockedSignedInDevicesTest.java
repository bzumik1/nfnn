package cz.novanadeje.app.donors.infrastructure.session;

import cz.novanadeje.app.donors.application.SignedInDeviceCheck;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.shared.application.session.SignedInDevice;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LockedSignedInDevicesTest {

    private static final Instant SIGNED_IN = Instant.parse("2026-11-01T08:00:00Z");
    private static final DonorId JANA = DonorId.newId(SIGNED_IN);

    @Mock
    private SignedInDeviceCheck check;

    private LockedSignedInDevices devices() {
        return new LockedSignedInDevices(check);
    }

    @Test
    @DisplayName("Given a device signed in as a public computer, when another context holds it, then it is answered as signed in and keeping nothing")
    void should_answer_signed_in_keeping_nothing_when_held_given_a_public_computer_session() {
        DonorDevice phone = DonorDevice.signIn(JANA, DeviceDescription.UNKNOWN, SessionKind.PUBLIC, SIGNED_IN);
        when(check.hold(JANA, phone.id())).thenReturn(Optional.of(phone));

        assertThat(devices().holdSignedIn(JANA.value(), phone.id().value())).contains(new SignedInDevice(true));
    }

    @Test
    @DisplayName("Given a device that is no longer signed in, when another context holds it, then nothing is answered and nothing is thrown")
    void should_answer_nothing_without_throwing_when_held_given_a_device_no_longer_signed_in() {
        DeviceId phone = DeviceId.newId(SIGNED_IN);
        when(check.hold(JANA, phone)).thenReturn(Optional.empty());

        assertThat(devices().holdSignedIn(JANA.value(), phone.value())).isEmpty();
    }

    @Test
    @DisplayName("Given devices of which one is signed in, when another context asks which are, then that one's id is answered")
    void should_answer_the_signed_in_id_when_asked_given_one_signed_in() {
        DeviceId live = DeviceId.newId(SIGNED_IN);
        DeviceId ended = DeviceId.newId(SIGNED_IN);
        when(check.signedInAmong(List.of(live, ended))).thenReturn(Set.of(live));

        assertThat(devices().signedInAmong(List.of(live.value(), ended.value()))).containsExactly(live.value());
    }
}
