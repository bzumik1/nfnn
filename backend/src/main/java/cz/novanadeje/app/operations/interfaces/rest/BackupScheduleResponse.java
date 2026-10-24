package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.backup.BackupScheduleView;
import cz.novanadeje.app.operations.domain.backup.BackupSchedule;

import java.time.format.DateTimeFormatter;

record BackupScheduleResponse(String backupTime, int testRestoreDay, String testRestoreTime, Plan applied) {

    private static final DateTimeFormatter HOURS_AND_MINUTES = DateTimeFormatter.ofPattern("HH:mm");

    static BackupScheduleResponse from(BackupScheduleView view) {
        Plan planned = Plan.from(view.planned());
        return new BackupScheduleResponse(planned.backupTime(), planned.testRestoreDay(), planned.testRestoreTime(),
                view.applied().map(Plan::from).orElse(null));
    }

    record Plan(String backupTime, int testRestoreDay, String testRestoreTime) {

        static Plan from(BackupSchedule schedule) {
            return new Plan(HOURS_AND_MINUTES.format(schedule.backupTime()), schedule.testRestoreDay().getValue(),
                    HOURS_AND_MINUTES.format(schedule.testRestoreTime()));
        }
    }
}
