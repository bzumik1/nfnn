package cz.novanadeje.app.operations.application.sync;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationView;
import cz.novanadeje.app.operations.application.backup.BackupKeyView;
import cz.novanadeje.app.operations.application.backup.BackupScheduleView;
import cz.novanadeje.app.operations.application.settings.SettingsView;

public record AdminOperations(SettingsView settings, BackupAdministrationView backups, BackupScheduleView backupSchedule, BackupKeyView backupKey) {

    public AdminOperations {
        if (settings == null || backups == null || backupSchedule == null || backupKey == null) {
            throw new IllegalArgumentException("The administration's operations name the settings, the backups, their plan and their key");
        }
    }
}
