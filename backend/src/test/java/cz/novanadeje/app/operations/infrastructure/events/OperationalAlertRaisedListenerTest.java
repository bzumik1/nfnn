package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.alerts.OperationalAlertService;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.shared.application.event.OperationalAlertRaised;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class OperationalAlertRaisedListenerTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    private final OperationalAlertService alerts = mock(OperationalAlertService.class);
    private final OperationalAlertRaisedListener listener = new OperationalAlertRaisedListener(alerts);

    @Test
    @DisplayName("Given an outage of each area, when it is raised, then the alert of the same area is recorded as opened at its moment")
    void should_record_each_area_as_opened_when_raised_given_an_outage() {
        listener.on(OperationalAlertRaised.opened(OperationalAlertRaised.Area.BANK_IMPORT, NOW));
        listener.on(OperationalAlertRaised.opened(OperationalAlertRaised.Area.BACKUPS, NOW));
        listener.on(OperationalAlertRaised.opened(OperationalAlertRaised.Area.MAIL, NOW));

        verify(alerts).record(MonitoredArea.BANK_IMPORT, true, NOW);
        verify(alerts).record(MonitoredArea.BACKUPS, true, NOW);
        verify(alerts).record(MonitoredArea.MAIL, true, NOW);
    }

    @Test
    @DisplayName("Given a recovery, when it is raised, then the alert of its area is recorded as resolved at its moment")
    void should_record_resolution_when_raised_given_a_recovery() {
        listener.on(OperationalAlertRaised.resolved(OperationalAlertRaised.Area.BACKUPS, NOW));

        verify(alerts).record(MonitoredArea.BACKUPS, false, NOW);
    }
}
