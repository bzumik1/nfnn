package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.operations.domain.backup.BackupAlert;
import cz.novanadeje.app.operations.domain.backup.BackupAlertRepository;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.operations.domain.backup.WaitingBackupAlert;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class JpaBackupAlertRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T05:15:00Z");
    private static final BackupAlert PROBLEMS = new BackupAlert.ProblemsDetected(Set.of(BackupProblem.TEST_RESTORE_STALE, BackupProblem.BACKUP_FAILED), NOW);
    private static final BackupAlert RECOVERY = new BackupAlert.Recovered(Set.of(BackupProblem.BACKUP_FAILED), NOW.plusSeconds(86_400));

    @Autowired
    private BackupAlertRepository alerts;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given a problem alert and a recovery added a day apart, when the waiting alerts are read, then both come back whole, oldest first")
    void should_return_waiting_alerts_oldest_first_when_read_given_two_added() {
        alerts.add(RECOVERY, NOW.plusSeconds(86_400));
        alerts.add(PROBLEMS, NOW);

        assertThat(alerts.waiting()).extracting(WaitingBackupAlert::alert).containsExactly(PROBLEMS, RECOVERY);
        assertThat(jdbc.sql("select problems from operations_backup_alert where kind = 'PROBLEMS'").query(String.class).single())
                .isEqualTo("BACKUP_FAILED,TEST_RESTORE_STALE");
    }

    @Test
    @DisplayName("Given a waiting alert, when it is marked sent, then it no longer waits and keeps the time it was sent")
    void should_stop_waiting_when_marked_sent_given_waiting_alert() {
        alerts.add(PROBLEMS, NOW);

        alerts.markSent(alerts.waiting().getFirst().id(), NOW.plusSeconds(60));

        assertThat(alerts.waiting()).isEmpty();
        assertThat(jdbc.sql("select outcome from operations_backup_alert").query(String.class).single()).isEqualTo("SENT");
        assertThat(jdbc.sql("select settled_at from operations_backup_alert").query(Instant.class).single()).isEqualTo(NOW.plusSeconds(60));
    }

    @Test
    @DisplayName("Given a sent problem alert, a waiting one and a waiting recovery, when the waiting alerts are dropped, then both waiting ones are marked dropped and the sent one stays sent")
    void should_drop_every_waiting_alert_when_dropped_given_sent_and_waiting_alerts() {
        alerts.add(PROBLEMS, NOW.minusSeconds(86_400));
        alerts.markSent(alerts.waiting().getFirst().id(), NOW.minusSeconds(86_400));
        alerts.add(PROBLEMS, NOW);
        alerts.add(RECOVERY, NOW.plusSeconds(60));

        alerts.dropWaiting(NOW.plusSeconds(90));

        assertThat(alerts.waiting()).isEmpty();
        assertThat(jdbc.sql("select outcome from operations_backup_alert order by created_at").query(String.class).list())
                .containsExactly("SENT", "DROPPED", "DROPPED");
    }
}
