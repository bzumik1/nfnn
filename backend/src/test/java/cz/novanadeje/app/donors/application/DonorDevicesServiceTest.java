package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.donors.domain.DeviceBrowser;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceNotFound;
import cz.novanadeje.app.donors.domain.DevicePlatform;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorDevicesServiceTest {

    private static final Instant SIGNED_IN = Instant.parse("2026-11-01T08:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final DonorId JANA = DonorId.newId(SIGNED_IN);
    private static final DeviceDescription IPHONE_SAFARI = new DeviceDescription(DevicePlatform.IPHONE, DeviceBrowser.SAFARI);

    @Mock
    private DonorDeviceRepository devices;
    @Mock
    private DeviceSignOuts signOuts;

    private DonorDevicesService service() {
        return new DonorDevicesService(devices, signOuts, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static DonorDevice usedAt(Instant lastUse) {
        DonorDevice device = DonorDevice.signIn(JANA, IPHONE_SAFARI, SessionKind.REMEMBERED, SIGNED_IN);
        device.recordUse(lastUse);
        return device;
    }

    @Test
    @DisplayName("Given three signed-in devices, when they are listed from one of them, then that one comes first marked current and the rest follow by their last use")
    void should_list_current_first_then_by_last_use_when_listed_given_three_devices() {
        DonorDevice current = usedAt(SIGNED_IN.plusSeconds(60));
        DonorDevice older = usedAt(SIGNED_IN.plusSeconds(600));
        DonorDevice newer = usedAt(SIGNED_IN.plusSeconds(6000));
        when(devices.findSignedInOf(JANA, NOW)).thenReturn(List.of(older, current, newer));

        List<DeviceView> listed = service().list(JANA, Optional.of(current.id()));

        assertThat(listed).extracting(DeviceView::id).containsExactly(current.id(), newer.id(), older.id());
        assertThat(listed).extracting(DeviceView::current).containsExactly(true, false, false);
        assertThat(listed.getFirst()).isEqualTo(new DeviceView(current.id(), IPHONE_SAFARI, SIGNED_IN, SIGNED_IN.plusSeconds(60), true));
    }

    @Test
    @DisplayName("Given two other devices signed in and last used at the same instant, when they are listed, then they follow by platform and browser whatever their ids")
    void should_order_by_platform_and_browser_when_listed_given_devices_used_at_the_same_instant() {
        DeviceId lowerId = new DeviceId(UUID.fromString("019a5a00-0000-7000-8000-000000000001"));
        DeviceId higherId = new DeviceId(UUID.fromString("019a5a00-0000-7000-8000-000000000002"));
        DeviceId highestId = new DeviceId(UUID.fromString("019a5a00-0000-7000-8000-000000000003"));
        DonorDevice unknown = DonorDevice.reconstitute(lowerId, JANA, DeviceDescription.UNKNOWN, SIGNED_IN, SIGNED_IN, null, null);
        DonorDevice iphoneChrome = DonorDevice.reconstitute(higherId, JANA,
                new DeviceDescription(DevicePlatform.IPHONE, DeviceBrowser.CHROME), SIGNED_IN, SIGNED_IN, null, null);
        DonorDevice iphoneSafari = DonorDevice.reconstitute(highestId, JANA, IPHONE_SAFARI, SIGNED_IN, SIGNED_IN, null, null);
        when(devices.findSignedInOf(JANA, NOW)).thenReturn(List.of(unknown, iphoneChrome, iphoneSafari));

        List<DeviceView> listed = service().list(JANA, Optional.empty());

        assertThat(listed).extracting(DeviceView::description)
                .containsExactly(IPHONE_SAFARI, new DeviceDescription(DevicePlatform.IPHONE, DeviceBrowser.CHROME), DeviceDescription.UNKNOWN);
    }

    @Test
    @DisplayName("Given a session without a device, when the devices are listed, then none is marked current")
    void should_mark_none_current_when_listed_given_session_without_device() {
        when(devices.findSignedInOf(JANA, NOW)).thenReturn(List.of(usedAt(SIGNED_IN)));

        assertThat(service().list(JANA, Optional.empty())).extracting(DeviceView::current).containsExactly(false);
    }

    @Test
    @DisplayName("Given the donor's active device, when it is signed out, then it ends remotely")
    void should_end_remotely_when_signed_out_given_own_active_device() {
        DeviceId phone = DeviceId.newId(SIGNED_IN);
        when(signOuts.end(JANA, phone, DeviceSignOutReason.REMOTE_SIGN_OUT, NOW)).thenReturn(true);

        service().signOut(JANA, phone);

        verify(signOuts).end(JANA, phone, DeviceSignOutReason.REMOTE_SIGN_OUT, NOW);
    }

    @Test
    @DisplayName("Given a device that is not the donor's active one (another donor's, ended or missing), when it is signed out, then it is not found")
    void should_not_find_when_signed_out_given_device_not_ended_by_the_sign_out() {
        DeviceId other = DeviceId.newId(SIGNED_IN);
        when(signOuts.end(JANA, other, DeviceSignOutReason.REMOTE_SIGN_OUT, NOW)).thenReturn(false);

        assertThatThrownBy(() -> service().signOut(JANA, other)).isInstanceOf(DeviceNotFound.class);
    }

    @Test
    @DisplayName("Given the current device, when every other device is signed out, then the others end and the current one is kept")
    void should_keep_current_when_others_signed_out_given_current_device() {
        DeviceId current = DeviceId.newId(SIGNED_IN);

        service().signOutOthers(JANA, Optional.of(current));

        verify(signOuts).endOthersOf(JANA, Optional.of(current), NOW);
    }
}
