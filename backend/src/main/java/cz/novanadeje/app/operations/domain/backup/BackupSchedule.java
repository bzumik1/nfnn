package cz.novanadeje.app.operations.domain.backup;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Objects;

public record BackupSchedule(LocalTime backupTime, DayOfWeek testRestoreDay, LocalTime testRestoreTime) {

    public static final BackupSchedule DEFAULT = new BackupSchedule(LocalTime.of(3, 0), DayOfWeek.SUNDAY, LocalTime.of(4, 0));

    public BackupSchedule {
        requireWholeMinute(Objects.requireNonNull(backupTime, "backupTime"), "backupTime");
        Objects.requireNonNull(testRestoreDay, "testRestoreDay");
        requireWholeMinute(Objects.requireNonNull(testRestoreTime, "testRestoreTime"), "testRestoreTime");
    }

    private static void requireWholeMinute(LocalTime time, String name) {
        if (time.getSecond() != 0 || time.getNano() != 0) {
            throw new IllegalArgumentException(name + " is a whole minute, but is " + time);
        }
    }
}
