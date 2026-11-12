package cz.novanadeje.app.operations.application.sync;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationService;
import cz.novanadeje.app.operations.application.backup.BackupKeyService;
import cz.novanadeje.app.operations.application.backup.BackupScheduleService;
import cz.novanadeje.app.operations.application.settings.SettingsService;
import cz.novanadeje.app.shared.application.account.AdministrationHolders;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class AdminOperationsSyncService {

    private final AdministrationHolders administrationHolders;
    private final SettingsService settings;
    private final BackupAdministrationService backups;
    private final BackupScheduleService backupSchedules;
    private final BackupKeyService backupKeys;

    public AdminOperationsSyncService(AdministrationHolders administrationHolders, SettingsService settings, BackupAdministrationService backups,
                                      BackupScheduleService backupSchedules, BackupKeyService backupKeys) {
        this.administrationHolders = administrationHolders;
        this.settings = settings;
        this.backups = backups;
        this.backupSchedules = backupSchedules;
        this.backupKeys = backupKeys;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AdminOperationsSyncSnapshot snapshotFor(UUID subject) {
        if (!administrationHolders.holdsAdministration(subject)) {
            return new AdminOperationsSyncSnapshot(subject, Optional.empty());
        }
        return new AdminOperationsSyncSnapshot(subject, Optional.of(new AdminOperations(settings.view(), backups.view(), backupSchedules.view(),
                backupKeys.view())));
    }
}
