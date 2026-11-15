package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
import cz.novanadeje.app.operations.application.push.PushAlertDispatcher;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class OperationalAlertPushListenerTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    private final PushAlertDispatcher dispatcher = mock(PushAlertDispatcher.class);
    private final OperationalAlertPushListener listener = new OperationalAlertPushListener(dispatcher);

    @Test
    @DisplayName("Given an opened backups alert, when the listener hears its change, then the dispatcher is called with the area, the opening, the change count and the open count")
    void should_call_the_dispatcher_with_the_change_values_when_heard_given_an_opened_alert() {
        listener.on(new OperationalAlertChanged(MonitoredArea.BACKUPS, true, 3, 2, NOW));

        verify(dispatcher).alertChanged(MonitoredArea.BACKUPS, true, 3, 2);
    }
}
