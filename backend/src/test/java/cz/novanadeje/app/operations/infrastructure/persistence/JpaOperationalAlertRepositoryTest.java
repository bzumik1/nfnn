package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlert;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlertRepository;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(OperationsPersistenceTestConfiguration.class)
class JpaOperationalAlertRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    @Autowired
    private OperationalAlertRepository alerts;

    @Autowired
    private DataSource dataSource;

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

    @Test
    @DisplayName("Given the alert changes locked in one transaction, when another connection tries each lock, then it gets the report settings lock and not the alerts' lock")
    void should_leave_the_report_settings_lock_free_when_tried_given_the_alert_changes_locked() throws Exception {
        alerts.lockChanges();

        assertThat(triedFromAnotherConnection(AdvisoryLock.REPORT_SETTINGS_CHANGES)).isTrue();
        assertThat(triedFromAnotherConnection(AdvisoryLock.OPERATIONAL_ALERT_CHANGES)).isFalse();
    }

    private boolean triedFromAnotherConnection(AdvisoryLock lock) throws Exception {
        return CompletableFuture.supplyAsync(() -> {
            try (Connection connection = dataSource.getConnection();
                 PreparedStatement statement = connection.prepareStatement("select pg_try_advisory_xact_lock(?)")) {
                connection.setAutoCommit(true);
                statement.setLong(1, lock.key());
                try (ResultSet result = statement.executeQuery()) {
                    result.next();
                    return result.getBoolean(1);
                }
            } catch (SQLException e) {
                throw new IllegalStateException(e);
            }
        }).get(10, TimeUnit.SECONDS);
    }
}
