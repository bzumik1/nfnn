package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class BackupHealthTest {

    private static final Instant NOW = Instant.parse("2026-10-23T05:15:00Z");
    private static final BackupLimits LIMITS = new BackupLimits(Duration.ofHours(26), Duration.ofDays(8));

    @Test
    @DisplayName("Given a fresh backup and a recent test restore, when assessed, then there is no problem")
    void should_be_healthy_when_assessed_given_fresh_runs() {
        BackupHealth health = BackupHealth.assess(Optional.of(ok(NOW.minus(Duration.ofHours(4)))), Optional.of(ok(NOW.minus(Duration.ofDays(3)))),
                List.of(file(NOW.minus(Duration.ofDays(20)))), NOW, LIMITS);

        assertThat(health.healthy()).isTrue();
        assertThat(health.problems()).isEmpty();
    }

    @Test
    @DisplayName("Given no status at all and no backup files, when assessed, then only the missing backup is reported")
    void should_report_missing_backup_when_assessed_given_nothing() {
        BackupHealth health = BackupHealth.assess(Optional.empty(), Optional.empty(), List.of(), NOW, LIMITS);

        assertThat(health.problems()).containsExactly(BackupProblem.BACKUP_MISSING);
    }

    @Test
    @DisplayName("Given a failed last backup and a test restore older than eight days, when assessed, then both problems are reported")
    void should_report_failed_and_stale_when_assessed_given_old_runs() {
        BackupHealth health = BackupHealth.assess(Optional.of(failed(NOW.minus(Duration.ofHours(2)))), Optional.of(ok(NOW.minus(Duration.ofDays(9)))),
                List.of(file(NOW.minus(Duration.ofDays(1)))), NOW, LIMITS);

        assertThat(health.problems()).containsExactlyInAnyOrder(BackupProblem.BACKUP_FAILED, BackupProblem.TEST_RESTORE_STALE);
    }

    @Test
    @DisplayName("Given a backup older than 26 hours and a failed test restore, when assessed, then stale and failed are reported")
    void should_report_stale_backup_when_assessed_given_old_backup() {
        BackupHealth health = BackupHealth.assess(Optional.of(ok(NOW.minus(Duration.ofHours(27)))), Optional.of(failed(NOW.minus(Duration.ofDays(1)))),
                List.of(), NOW, LIMITS);

        assertThat(health.problems()).containsExactlyInAnyOrder(BackupProblem.BACKUP_STALE, BackupProblem.TEST_RESTORE_FAILED);
    }

    @Test
    @DisplayName("Given backups older than eight days but no test restore yet, when assessed, then the missing test restore is reported")
    void should_report_missing_test_restore_when_assessed_given_old_backups_without_test() {
        BackupHealth health = BackupHealth.assess(Optional.of(ok(NOW.minus(Duration.ofHours(1)))), Optional.empty(),
                List.of(file(NOW.minus(Duration.ofDays(1))), file(NOW.minus(Duration.ofDays(9)))), NOW, LIMITS);

        assertThat(health.problems()).containsExactly(BackupProblem.TEST_RESTORE_MISSING);
    }

    @Test
    @DisplayName("Given only backups younger than eight days and no test restore yet, when assessed, then nothing is reported")
    void should_be_healthy_when_assessed_given_young_backups_without_test() {
        BackupHealth health = BackupHealth.assess(Optional.of(ok(NOW.minus(Duration.ofHours(1)))), Optional.empty(),
                List.of(file(NOW.minus(Duration.ofDays(2)))), NOW, LIMITS);

        assertThat(health.healthy()).isTrue();
    }

    private static BackupRun ok(Instant finishedAt) {
        return new BackupRun(RunOutcome.OK, finishedAt.minusSeconds(3), finishedAt, Optional.of("nfnn-2026-10-23_0300.dump.age"), Optional.of(1590L),
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty());
    }

    private static BackupRun failed(Instant finishedAt) {
        return new BackupRun(RunOutcome.FAILED, finishedAt.minusSeconds(3), finishedAt, Optional.of("nfnn-2026-10-23_0300.dump.age"), Optional.empty(),
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.of("pg_dump: error: connection failed"));
    }

    private static BackupFile file(Instant createdAt) {
        return new BackupFile("nfnn-2026-10-01_0300.dump.age", 1590, createdAt);
    }
}
