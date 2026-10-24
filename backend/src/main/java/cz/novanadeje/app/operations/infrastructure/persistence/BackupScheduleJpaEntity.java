package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.DayOfWeek;
import java.time.LocalTime;

@Entity
@Table(name = "operations_backup_schedule")
class BackupScheduleJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "backup_time", nullable = false)
    private LocalTime backupTime;

    @Column(name = "test_restore_day", nullable = false)
    private short testRestoreDay;

    @Column(name = "test_restore_time", nullable = false)
    private LocalTime testRestoreTime;

    protected BackupScheduleJpaEntity() {
    }

    static BackupScheduleJpaEntity fromDomain(BackupSchedule schedule) {
        BackupScheduleJpaEntity entity = new BackupScheduleJpaEntity();
        entity.id = SINGLETON_ID;
        entity.backupTime = schedule.backupTime();
        entity.testRestoreDay = (short) schedule.testRestoreDay().getValue();
        entity.testRestoreTime = schedule.testRestoreTime();
        return entity;
    }

    BackupSchedule toDomain() {
        return new BackupSchedule(backupTime, DayOfWeek.of(testRestoreDay), testRestoreTime);
    }
}
