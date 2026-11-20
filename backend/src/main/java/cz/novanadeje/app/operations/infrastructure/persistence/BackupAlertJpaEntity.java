package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.backup.BackupAlert;
import cz.novanadeje.app.operations.domain.backup.BackupAlertId;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.operations.domain.backup.WaitingBackupAlert;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Entity
@Table(name = "operations_backup_alert")
class BackupAlertJpaEntity {

    enum Kind {
        PROBLEMS,
        RECOVERY
    }

    private static final String SEPARATOR = ",";

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 16)
    private Kind kind;

    @Column(name = "problems", nullable = false, length = BackupAlertStateJpaEntity.MAX_PROBLEMS_LENGTH)
    private String problems;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "outcome", length = 16)
    private String outcome;

    @Column(name = "settled_at")
    private Instant settledAt;

    protected BackupAlertJpaEntity() {
    }

    static BackupAlertJpaEntity waiting(BackupAlertId id, BackupAlert alert, Instant createdAt) {
        BackupAlertJpaEntity entity = new BackupAlertJpaEntity();
        entity.id = id.value();
        entity.kind = switch (alert) {
            case BackupAlert.ProblemsDetected detected -> Kind.PROBLEMS;
            case BackupAlert.Recovered recovered -> Kind.RECOVERY;
        };
        entity.problems = alert.problems().stream().map(Enum::name).sorted().collect(Collectors.joining(SEPARATOR));
        entity.occurredAt = alert.occurredAt();
        entity.createdAt = createdAt;
        return entity;
    }

    WaitingBackupAlert toWaiting() {
        Set<BackupProblem> named = Arrays.stream(problems.split(SEPARATOR)).map(BackupProblem::valueOf).collect(Collectors.toSet());
        BackupAlert alert = switch (kind) {
            case PROBLEMS -> new BackupAlert.ProblemsDetected(named, occurredAt);
            case RECOVERY -> new BackupAlert.Recovered(named, occurredAt);
        };
        return new WaitingBackupAlert(new BackupAlertId(id), alert);
    }
}
