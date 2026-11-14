package cz.novanadeje.app.operations.application.alerts;

import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlert;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class OperationalAlertServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    private final InMemoryOperationalAlerts alerts = new InMemoryOperationalAlerts();
    private final List<Object> published = new ArrayList<>();
    private final OperationalAlertService service = new OperationalAlertService(alerts, published::add);

    @Test
    @DisplayName("Given no open alert, when the bank import outage is raised, then its alert opens under the lock and the change is announced with one open alert")
    void should_open_and_announce_when_raised_given_no_open_alert() {
        service.record(MonitoredArea.BANK_IMPORT, true, NOW);

        assertThat(alerts.find(MonitoredArea.BANK_IMPORT)).contains(new OperationalAlert(MonitoredArea.BANK_IMPORT, Optional.of(NOW), 1));
        assertThat(alerts.locks()).isEqualTo(1);
        assertThat(published).containsExactly(new OperationalAlertChanged(MonitoredArea.BANK_IMPORT, true, 1, 1, NOW));
    }

    @Test
    @DisplayName("Given an open backups alert, when it is raised again, then nothing changes and nothing is announced")
    void should_announce_nothing_when_raised_again_given_open_alert() {
        service.record(MonitoredArea.BACKUPS, true, NOW);
        published.clear();

        service.record(MonitoredArea.BACKUPS, true, NOW.plusSeconds(86_400));

        assertThat(alerts.find(MonitoredArea.BACKUPS)).contains(new OperationalAlert(MonitoredArea.BACKUPS, Optional.of(NOW), 1));
        assertThat(published).isEmpty();
    }

    @Test
    @DisplayName("Given open mail and bank import alerts, when the mail alert is resolved, then it closes and the change is announced with the one alert still open")
    void should_resolve_and_count_others_when_resolved_given_two_open_alerts() {
        service.record(MonitoredArea.MAIL, true, NOW);
        service.record(MonitoredArea.BANK_IMPORT, true, NOW);
        published.clear();

        service.record(MonitoredArea.MAIL, false, NOW.plusSeconds(60));

        assertThat(published).containsExactly(new OperationalAlertChanged(MonitoredArea.MAIL, false, 2, 1, NOW.plusSeconds(60)));
        assertThat(service.open()).extracting(OperationalAlert::area).containsExactly(MonitoredArea.BANK_IMPORT);
        assertThat(service.unchangedSince(MonitoredArea.MAIL, 2)).isTrue();
        assertThat(service.unchangedSince(MonitoredArea.MAIL, 1)).isFalse();
    }

    @Test
    @DisplayName("Given no open alert, when an alert is resolved, then nothing is stored or announced")
    void should_do_nothing_when_resolved_given_closed_alert() {
        service.record(MonitoredArea.MAIL, false, NOW);

        assertThat(alerts.find(MonitoredArea.MAIL)).isEmpty();
        assertThat(published).isEmpty();
        assertThat(service.open()).isEmpty();
    }
}
