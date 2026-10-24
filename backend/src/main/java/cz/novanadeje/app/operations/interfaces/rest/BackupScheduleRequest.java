package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.DayOfWeek;
import java.time.LocalTime;

record BackupScheduleRequest(
        @NotNull @Pattern(regexp = TIME) String backupTime,
        @NotNull @Min(1) @Max(7) Integer testRestoreDay,
        @NotNull @Pattern(regexp = TIME) String testRestoreTime) {

    static final String TIME = "([01][0-9]|2[0-3]):[0-5][0-9]";

    BackupSchedule toSchedule() {
        return new BackupSchedule(LocalTime.parse(backupTime), DayOfWeek.of(testRestoreDay), LocalTime.parse(testRestoreTime));
    }
}
