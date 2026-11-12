package cz.novanadeje.app.operations.application.sync;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationService;
import cz.novanadeje.app.operations.application.backup.BackupAdministrationView;
import cz.novanadeje.app.operations.application.backup.BackupKeyService;
import cz.novanadeje.app.operations.application.backup.BackupKeyView;
import cz.novanadeje.app.operations.application.backup.BackupScheduleService;
import cz.novanadeje.app.operations.application.backup.BackupScheduleView;
import cz.novanadeje.app.operations.application.settings.SettingsService;
import cz.novanadeje.app.operations.application.settings.SettingsView;
import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import cz.novanadeje.app.shared.application.account.AdministrationHolders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminOperationsSyncServiceTest {

    private static final UUID SUBJECT = UUID.fromString("0192f0f1-0000-7000-8000-0000000000aa");

    @Mock
    private AdministrationHolders administrationHolders;
    @Mock
    private SettingsService settings;
    @Mock
    private BackupAdministrationService backups;
    @Mock
    private BackupScheduleService backupSchedules;
    @Mock
    private BackupKeyService backupKeys;

    private AdminOperationsSyncService service;

    @BeforeEach
    void setUp() {
        service = new AdminOperationsSyncService(administrationHolders, settings, backups, backupSchedules, backupKeys);
    }

    @Test
    @DisplayName("Given an account without the administration, when its operations snapshot is taken, then it holds nothing and neither the settings nor the backup folder is read")
    void should_hold_nothing_when_snapshot_taken_given_account_without_administration() {
        when(administrationHolders.holdsAdministration(SUBJECT)).thenReturn(false);

        AdminOperationsSyncSnapshot snapshot = service.snapshotFor(SUBJECT);

        assertThat(snapshot.administrator()).isFalse();
        assertThat(snapshot.operations()).isEmpty();
        verifyNoInteractions(settings, backups, backupSchedules, backupKeys);
    }

    @Test
    @DisplayName("Given an administrator, when the operations snapshot is taken, then it holds what the settings and the backups pages read")
    void should_hold_what_the_pages_read_when_snapshot_taken_given_administrator() {
        SettingsView settingsView = new SettingsView(List.of(), true, "0123456789abcdef");
        BackupScheduleView schedule = new BackupScheduleView(BackupSchedule.DEFAULT, Optional.empty());
        BackupKeyView key = new BackupKeyView(true, false, Optional.empty());
        when(administrationHolders.holdsAdministration(SUBJECT)).thenReturn(true);
        when(settings.view()).thenReturn(settingsView);
        when(backups.view()).thenReturn(BackupAdministrationView.unavailable());
        when(backupSchedules.view()).thenReturn(schedule);
        when(backupKeys.view()).thenReturn(key);

        AdminOperationsSyncSnapshot snapshot = service.snapshotFor(SUBJECT);

        assertThat(snapshot.operations()).contains(new AdminOperations(settingsView, BackupAdministrationView.unavailable(), schedule, key));
    }
}
