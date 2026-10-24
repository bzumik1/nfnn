package cz.novanadeje.app.operations.domain.backup;

import java.util.Optional;

public interface BackupScheduleRepository {

    Optional<BackupSchedule> find();

    void save(BackupSchedule schedule);
}
