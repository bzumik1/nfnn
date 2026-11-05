package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlert;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlertRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(OperationsPersistenceTestConfiguration.class)
class JpaOperationalAlertRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    @Autowired
    private OperationalAlertRepository alerts;

    @Test
    @DisplayName("Given nothing saved, when the alerts are read, then every area is closed and has never changed")
    void should_list_every_area_closed_when_read_given_nothing_saved() {
        assertThat(alerts.findAll()).containsExactly(OperationalAlert.closed(MonitoredArea.BANK_IMPORT), OperationalAlert.closed(MonitoredArea.BACKUPS),
                OperationalAlert.closed(MonitoredArea.MAIL));
        assertThat(alerts.find(MonitoredArea.MAIL)).isEmpty();
    }

    @Test
    @DisplayName("Given an alert opened and later resolved, when it is read back each time, then its start and its count of changes round-trip")
    void should_round_trip_when_saved_given_an_alert_opened_and_resolved() {
        alerts.lockChanges();
        OperationalAlert opened = OperationalAlert.closed(MonitoredArea.BACKUPS).openedAt(NOW).orElseThrow();
        alerts.save(opened);
        assertThat(alerts.find(MonitoredArea.BACKUPS)).contains(opened);
        assertThat(alerts.findAll()).contains(opened, OperationalAlert.closed(MonitoredArea.MAIL));

        OperationalAlert resolved = opened.resolvedAt(NOW.plusSeconds(60)).orElseThrow();
        alerts.save(resolved);

        assertThat(alerts.find(MonitoredArea.BACKUPS)).contains(resolved);
        assertThat(resolved.changes()).isEqualTo(2);
    }
}
