package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.DeviceStatusService.DeviceStatusView;
import cz.novanadeje.app.donors.domain.DeviceBrowser;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DevicePlatform;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DeviceStatus;
import cz.novanadeje.app.donors.domain.DeviceStatusSecret;
import cz.novanadeje.app.donors.domain.DeviceWipe;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DeviceStatusServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final DonorId JANA = DonorId.newId(NOW);
    private static final DeviceStatusSecret SECRET = DeviceStatusSecret.generate();

    @Mock
    private DonorDeviceRepository devices;

    @Mock
    private DonorRepository donors;

    private DeviceStatusService service() {
        return new DeviceStatusService(devices, donors);
    }

    private static DonorDevice device(Instant endedAt, DeviceSignOutReason reason, DeviceWipe wipe) {
        return DonorDevice.reconstitute(DeviceId.newId(NOW), JANA, new DeviceDescription(DevicePlatform.IPHONE, DeviceBrowser.SAFARI), SessionKind.APP, NOW,
                NOW, endedAt, reason, SECRET.hash(), wipe);
    }

    private void accountIs(boolean administrator) {
        Donor jana = Donor.register(JANA, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS, NOW);
        if (administrator) {
            jana.verifyEmail(NOW);
            jana.grantAdministration(true);
        }
        when(donors.findById(JANA)).thenReturn(Optional.of(jana));
    }

    @Test
    @DisplayName("Given no device holds the secret, when its status is asked by the secret's hash, then it is unknown and no account is read")
    void should_be_unknown_without_reading_account_when_asked_given_no_device() {
        when(devices.findByStatusSecretHash(SECRET.hash())).thenReturn(Optional.empty());

        assertThat(service().statusOf(SECRET)).isEqualTo(new DeviceStatusView(DeviceStatus.UNKNOWN, false));
        verify(donors, never()).findById(any());
    }

    @Test
    @DisplayName("Given a signed-in device of an administrator, when its status is asked, then it is signed in for an administrator")
    void should_be_signed_in_for_administrator_when_asked_given_active_device_of_administrator() {
        when(devices.findByStatusSecretHash(SECRET.hash())).thenReturn(Optional.of(device(null, null, null)));
        accountIs(true);

        assertThat(service().statusOf(SECRET)).isEqualTo(new DeviceStatusView(DeviceStatus.SIGNED_IN, true));
    }

    @Test
    @DisplayName("Given a device ended by a replay of a donor, when its status is asked, then it is signed out for an account that is no administrator")
    void should_be_signed_out_when_asked_given_device_ended_by_replay() {
        when(devices.findByStatusSecretHash(SECRET.hash())).thenReturn(Optional.of(device(NOW, DeviceSignOutReason.REPLAY, null)));
        accountIs(false);

        assertThat(service().statusOf(SECRET)).isEqualTo(new DeviceStatusView(DeviceStatus.SIGNED_OUT, false));
    }

    @Test
    @DisplayName("Given a device of an administrator ended by a replay, when its status is asked, then it is signed out for an administrator, so the administration copy stays")
    void should_be_signed_out_for_administrator_when_asked_given_device_of_administrator_ended_by_replay() {
        when(devices.findByStatusSecretHash(SECRET.hash())).thenReturn(Optional.of(device(NOW, DeviceSignOutReason.REPLAY, null)));
        accountIs(true);

        assertThat(service().statusOf(SECRET)).isEqualTo(new DeviceStatusView(DeviceStatus.SIGNED_OUT, true));
    }

    @Test
    @DisplayName("Given devices told to delete, when their status is asked, then the order is answered for no administrator and no account is read")
    void should_answer_order_without_reading_account_when_asked_given_wipe() {
        when(devices.findByStatusSecretHash(SECRET.hash())).thenReturn(Optional.of(device(NOW, DeviceSignOutReason.ADMINISTRATION_CHANGED, DeviceWipe.ADMINISTRATION)));
        assertThat(service().statusOf(SECRET)).isEqualTo(new DeviceStatusView(DeviceStatus.WIPE_ADMINISTRATION, false));

        when(devices.findByStatusSecretHash(SECRET.hash())).thenReturn(Optional.of(device(NOW, DeviceSignOutReason.REMOTE_SIGN_OUT, DeviceWipe.ALL)));
        assertThat(service().statusOf(SECRET)).isEqualTo(new DeviceStatusView(DeviceStatus.WIPE_ALL, false));

        verify(donors, never()).findById(any());
    }
}
