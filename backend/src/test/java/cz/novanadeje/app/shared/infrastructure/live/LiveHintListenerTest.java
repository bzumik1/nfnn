package cz.novanadeje.app.shared.infrastructure.live;

import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class LiveHintListenerTest {

    private final LiveStreamHub hub = mock(LiveStreamHub.class);
    private final LiveHintListener listener = new LiveHintListener(hub);

    @Test
    @DisplayName("Given the live hub, when a device is signed out, then the hub ends that device's streams")
    void should_end_device_streams_when_device_signed_out_given_hub() {
        DeviceSignedOut signedOut = new DeviceSignedOut(UUID.randomUUID(), UUID.randomUUID(), Instant.parse("2026-11-05T09:00:00Z"));

        listener.onDeviceSignedOut(signedOut);

        verify(hub).endDevice(signedOut);
    }
}
