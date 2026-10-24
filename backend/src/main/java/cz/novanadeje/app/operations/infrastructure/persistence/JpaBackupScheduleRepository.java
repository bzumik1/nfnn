package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import cz.novanadeje.app.operations.domain.backup.BackupScheduleRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaBackupScheduleRepository implements BackupScheduleRepository {

    private final BackupScheduleJpaRepository jpa;

    JpaBackupScheduleRepository(BackupScheduleJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<BackupSchedule> find() {
        return jpa.findById(BackupScheduleJpaEntity.SINGLETON_ID).map(BackupScheduleJpaEntity::toDomain);
    }

    @Override
    public void save(BackupSchedule schedule) {
        jpa.save(BackupScheduleJpaEntity.fromDomain(schedule));
    }
}
