package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.alerts.OperationalAlertService;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.shared.application.event.ImportOutageChanged;
import cz.novanadeje.app.support.ThreadTransaction;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class ImportOutageListenerTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    private final OperationalAlertService alerts = mock(OperationalAlertService.class);
    private final ImportOutageListener listener = new ImportOutageListener(alerts);

    @Test
    @DisplayName("Given an import outage, when donations announces it, then the bank import alert is recorded as opened at its moment")
    void should_record_bank_import_alert_as_opened_when_announced_given_an_import_outage() {
        try (ThreadTransaction ignored = ThreadTransaction.readWrite()) {
            listener.on(ImportOutageChanged.opened(NOW));
        }

        verify(alerts).record(MonitoredArea.BANK_IMPORT, true, NOW);
    }

    @Test
    @DisplayName("Given a working import, when donations announces it, then the bank import alert is recorded as resolved at its moment")
    void should_record_bank_import_alert_as_resolved_when_announced_given_a_working_import() {
        try (ThreadTransaction ignored = ThreadTransaction.readWrite()) {
            listener.on(ImportOutageChanged.resolved(NOW));
        }

        verify(alerts).record(MonitoredArea.BANK_IMPORT, false, NOW);
    }

    @Test
    @DisplayName("Given no transaction of the publisher, when donations announces an outage, then the listener fails and records no alert")
    void should_fail_and_record_nothing_when_announced_given_no_transaction() {
        assertThatThrownBy(() -> listener.on(ImportOutageChanged.opened(NOW))).isInstanceOf(IllegalStateException.class);

        verifyNoInteractions(alerts);
    }
}
