package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupSchedule;

import java.util.Objects;
import java.util.Optional;

public record BackupScheduleView(BackupSchedule planned, Optional<BackupSchedule> applied) {

    public BackupScheduleView {
        Objects.requireNonNull(planned, "planned");
        Objects.requireNonNull(applied, "applied");
    }
}
