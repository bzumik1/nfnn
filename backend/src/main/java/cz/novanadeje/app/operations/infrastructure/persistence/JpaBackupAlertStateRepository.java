package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.backup.BackupAlertState;
import cz.novanadeje.app.operations.domain.backup.BackupAlertStateRepository;
import org.springframework.stereotype.Repository;

@Repository
class JpaBackupAlertStateRepository implements BackupAlertStateRepository {

    private final BackupAlertStateJpaRepository jpa;

    JpaBackupAlertStateRepository(BackupAlertStateJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public BackupAlertState current() {
        return jpa.findById(BackupAlertStateJpaEntity.SINGLETON_ID).map(BackupAlertStateJpaEntity::toDomain).orElseGet(BackupAlertState::nothingReported);
    }

    @Override
    public void save(BackupAlertState state) {
        jpa.save(BackupAlertStateJpaEntity.fromDomain(state));
    }
}
