package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.backup.BackupAlert;
import cz.novanadeje.app.operations.domain.backup.BackupAlertId;
import cz.novanadeje.app.operations.domain.backup.BackupAlertRepository;
import cz.novanadeje.app.operations.domain.backup.WaitingBackupAlert;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
class JpaBackupAlertRepository implements BackupAlertRepository {

    private final BackupAlertJpaRepository jpa;

    JpaBackupAlertRepository(BackupAlertJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void add(BackupAlert alert, Instant at) {
        jpa.save(BackupAlertJpaEntity.waiting(BackupAlertId.newId(at), alert, at));
    }

    @Override
    public List<WaitingBackupAlert> waiting() {
        return jpa.findWaiting().stream().map(BackupAlertJpaEntity::toWaiting).toList();
    }

    @Override
    public void markSent(BackupAlertId id, Instant at) {
        jpa.markSent(id.value(), at);
    }

    @Override
    public void dropWaitingProblems(Instant at) {
        jpa.dropWaiting(BackupAlertJpaEntity.Kind.PROBLEMS, at);
    }
}
