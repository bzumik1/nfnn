package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.backup.BackupAlertState;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Entity
@Table(name = "backup_alert_state")
public class BackupAlertStateJpaEntity {

    static final short SINGLETON_ID = 1;
    static final int MAX_PROBLEMS_LENGTH = 200;
    private static final String SEPARATOR = ",";

    @Id
    private Short id;

    @Column(name = "reported_problems", length = MAX_PROBLEMS_LENGTH)
    private String reportedProblems;

    @Column(name = "reported_at")
    private Instant reportedAt;

    protected BackupAlertStateJpaEntity() {
    }

    static BackupAlertStateJpaEntity fromDomain(BackupAlertState state) {
        BackupAlertStateJpaEntity entity = new BackupAlertStateJpaEntity();
        entity.id = SINGLETON_ID;
        entity.reportedProblems = state.reporting()
                ? state.reportedProblems().stream().map(Enum::name).sorted().collect(Collectors.joining(SEPARATOR))
                : null;
        entity.reportedAt = state.reportedAt().orElse(null);
        return entity;
    }

    BackupAlertState toDomain() {
        if (reportedProblems == null || reportedAt == null) {
            return BackupAlertState.nothingReported();
        }
        Set<BackupProblem> problems = Arrays.stream(reportedProblems.split(SEPARATOR)).map(BackupProblem::valueOf).collect(Collectors.toSet());
        return new BackupAlertState(problems, Optional.of(reportedAt));
    }
}
