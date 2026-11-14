package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.operations.domain.backup.BackupAlertState;
import cz.novanadeje.app.operations.domain.backup.BackupAlertStateRepository;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class JpaBackupAlertStateRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T05:15:00Z");

    @Autowired
    private BackupAlertStateRepository states;

    @Test
    @DisplayName("Given nothing saved, when the state is read, then nothing is reported")
    void should_report_nothing_when_read_given_nothing_saved() {
        assertThat(states.current()).isEqualTo(BackupAlertState.nothingReported());
    }

    @Test
    @DisplayName("Given reported problems saved, when read and then cleared, then the problems round-trip and the clearing sticks")
    void should_round_trip_when_saved_given_reported_problems() {
        BackupAlertState reported = BackupAlertState.reported(Set.of(BackupProblem.BACKUP_FAILED, BackupProblem.TEST_RESTORE_STALE), NOW);

        states.save(reported);
        assertThat(states.current()).isEqualTo(reported);

        states.save(BackupAlertState.nothingReported());
        assertThat(states.current()).isEqualTo(BackupAlertState.nothingReported());
    }
}
