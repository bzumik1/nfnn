package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.application.backup.BackupKeyRevealRefusals;
import cz.novanadeje.app.operations.application.backup.BackupKeyService;
import cz.novanadeje.app.operations.application.backup.BackupKeyWordChallenges;
import cz.novanadeje.app.operations.application.backup.BackupRestoreService;
import cz.novanadeje.app.operations.application.backup.BackupStore;
import cz.novanadeje.app.operations.application.backup.InMemoryBackupKeyConfirmations;
import cz.novanadeje.app.operations.application.backup.RestoreRequest;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupKeyCheckMismatch;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWordCheck;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RestoreRecordRepository;
import cz.novanadeje.app.operations.domain.backup.RestoreSource;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;
import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.operations.domain.settings.SetupCode;
import cz.novanadeje.app.operations.domain.settings.SetupCompleted;
import cz.novanadeje.app.operations.domain.settings.SetupLocked;
import cz.novanadeje.app.operations.domain.settings.SetupStateRepository;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SetupServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T16:00:00Z");
    private static final List<SettingChange> ESSENTIALS = List.of(
            new SettingChange(Setting.PUBLIC_URL, "https://nfnn.cz"),
            new SettingChange(Setting.MAIL_HOST, "smtp-relay.brevo.com"),
            new SettingChange(Setting.MAIL_PORT, "587"),
            new SettingChange(Setting.MAIL_PASSWORD, "key"),
            new SettingChange(Setting.MAIL_FROM, "info@nfnn.cz"),
            new SettingChange(Setting.CONTACT_RECIPIENT, "info@nfnn.cz"),
            new SettingChange(Setting.ADMIN_EMAILS, "pavel@example.cz"));

    private final FakeSetupState state = new FakeSetupState();
    private final InMemorySettingsRepository repository = new InMemorySettingsRepository();
    private final SettingsValidator validator = mock(SettingsValidator.class);
    private final SetupCodeAnnouncer announcer = mock(SetupCodeAnnouncer.class);
    private final MailServerProbe mailProbe = mock(MailServerProbe.class);
    private final ApplicationRestarter restarter = mock(ApplicationRestarter.class);
    private final BackupStore backups = mock(BackupStore.class);
    private static final BackupKey BACKUP_KEY = new BackupKey("AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH");
    private static final List<BackupKeyWordCheck> KEY_CHECK = List.of(new BackupKeyWordCheck(2, "komora"), new BackupKeyWordCheck(13, "motivace"),
            new BackupKeyWordCheck(24, "studna"));

    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private final InMemoryBackupKeyConfirmations keyConfirmations = new InMemoryBackupKeyConfirmations();
    private final BackupKeyService backupKeys = new BackupKeyService(() -> Optional.of(BACKUP_KEY), keyConfirmations, mock(FreshSecondFactor.class),
            mock(BackupKeyRevealRefusals.class), new BackupKeyWordChallenges(), mock(ApplicationEventPublisher.class), clock);
    private final SetupService setup = new SetupService(state, new SettingsWriter(repository, new ReversibleSealer(), validator), announcer,
            mailProbe, restarter, backups, new BackupRestoreService(backups, mock(RestoreRecordRepository.class), restarter,
            mock(ApplicationEventPublisher.class), key -> false, clock), backupKeys, clock);

    private SetupCode code;

    @BeforeEach
    void announce() {
        when(validator.validate(any(), any(), any())).thenReturn(List.of());
        setup.announceCodeWhileRequired();
        ArgumentCaptor<SetupCode> announced = ArgumentCaptor.forClass(SetupCode.class);
        verify(announcer).announce(announced.capture());
        code = announced.getValue();
    }

    @Test
    @DisplayName("Given no setup yet, when the status is asked from the home network, then the setup is required without a code")
    void should_require_setup_without_code_when_asked_given_home_network() {
        assertThat(setup.status(true)).isEqualTo(new SetupStatusView(true, false, Optional.empty()));
        assertThat(setup.status(false)).isEqualTo(new SetupStatusView(true, true, Optional.empty()));
    }

    @Test
    @DisplayName("Given a request from elsewhere, when it brings no code or a wrong one, then the setup stays locked")
    void should_stay_locked_when_unlocked_given_wrong_code_from_elsewhere() {
        assertThatThrownBy(() -> setup.unlock(new SetupAccess(false, null))).isInstanceOf(SetupLocked.class);
        assertThatThrownBy(() -> setup.unlock(new SetupAccess(false, "AAAA-AAAA-AAAA"))).isInstanceOf(SetupLocked.class);
        assertThatThrownBy(() -> setup.complete(new SetupAccess(false, "nope"), ESSENTIALS, KEY_CHECK)).isInstanceOf(SetupLocked.class);
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("Given the announced code, when a request from elsewhere brings it, then the setup opens")
    void should_open_when_unlocked_given_announced_code() {
        setup.unlock(new SetupAccess(false, code.display().toLowerCase()));
        setup.unlock(new SetupAccess(true, null));
    }

    @Test
    @DisplayName("Given the essentials, when the setup is completed, then they are stored, the setup closes and the backend restarts")
    void should_store_close_and_restart_when_completed_given_essentials() {
        List<Setting> stored = setup.complete(new SetupAccess(true, null), ESSENTIALS, KEY_CHECK);

        assertThat(stored).hasSize(ESSENTIALS.size());
        assertThat(repository.findAll()).hasSize(ESSENTIALS.size());
        assertThat(state.completedAt).contains(NOW);
        verify(restarter).restartAfterCommit();
        assertThat(setup.status(true)).isEqualTo(new SetupStatusView(false, false, Optional.empty()));
    }

    @Test
    @DisplayName("Given an open setup, when the backup key is asked for, then it is shown; once the setup is done or without the code it is not")
    void should_show_backup_key_when_asked_given_open_setup() {
        assertThat(setup.backupKey(new SetupAccess(true, null)).key()).isEqualTo(BACKUP_KEY);
        assertThatThrownBy(() -> setup.backupKey(new SetupAccess(false, "AAAA-AAAA-AAAA"))).isInstanceOf(SetupLocked.class);

        setup.complete(new SetupAccess(true, null), ESSENTIALS, KEY_CHECK);

        assertThatThrownBy(() -> setup.backupKey(new SetupAccess(true, null))).isInstanceOf(SetupCompleted.class);
    }

    @Test
    @DisplayName("Given the essentials, when the setup is completed with three words of the backup key, then the key counts as saved")
    void should_confirm_backup_key_when_completed_given_three_of_its_words() {
        setup.complete(new SetupAccess(true, null), ESSENTIALS, KEY_CHECK);

        assertThat(keyConfirmations.find()).hasValueSatisfying(confirmation -> {
            assertThat(confirmation.confirms(BACKUP_KEY)).isTrue();
            assertThat(confirmation.confirmedAt()).isEqualTo(NOW);
            assertThat(confirmation.confirmedBy()).isEmpty();
        });
    }

    @Test
    @DisplayName("Given other words than those of the backup key, when the setup is completed, then it is refused, stays open and stores nothing")
    void should_refuse_when_completed_given_wrong_backup_key_check() {
        assertThatThrownBy(() -> setup.complete(new SetupAccess(true, null), ESSENTIALS, List.of(new BackupKeyWordCheck(1, "komora"), new BackupKeyWordCheck(13, "motivace"),
                new BackupKeyWordCheck(24, "studna")))).isInstanceOf(BackupKeyCheckMismatch.class);
        assertThatThrownBy(() -> setup.complete(new SetupAccess(true, null), ESSENTIALS, List.of())).isInstanceOf(BackupKeyCheckMismatch.class);

        assertThat(repository.findAll()).isEmpty();
        assertThat(state.completedAt).isEmpty();
        assertThat(keyConfirmations.find()).isEmpty();
        verify(restarter, never()).restartAfterCommit();
    }

    @Test
    @DisplayName("Given a required setting missing, when the setup is completed, then it is refused, stays open and nothing restarts")
    void should_refuse_when_completed_given_missing_required_setting() {
        assertThatThrownBy(() -> setup.complete(new SetupAccess(true, null), ESSENTIALS.subList(0, 3), KEY_CHECK)).isInstanceOf(SettingsRejected.class);

        assertThat(state.completedAt).isEmpty();
        verify(restarter, never()).restartAfterCommit();
    }

    @Test
    @DisplayName("Given an administration-only setting, when the setup is completed with it, then it is refused")
    void should_refuse_when_completed_given_administration_only_setting() {
        assertThatThrownBy(() -> setup.complete(new SetupAccess(true, null), List.of(new SettingChange(Setting.RECEIPT_FIRST_YEAR, "2026")), KEY_CHECK))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a completed setup, when anything of the setup is used again, then it answers that the setup is done")
    void should_refuse_everything_when_used_given_completed_setup() {
        setup.complete(new SetupAccess(true, null), ESSENTIALS, KEY_CHECK);

        assertThatThrownBy(() -> setup.unlock(new SetupAccess(true, null))).isInstanceOf(SetupCompleted.class);
        assertThatThrownBy(() -> setup.complete(new SetupAccess(false, code.value()), ESSENTIALS, KEY_CHECK)).isInstanceOf(SetupCompleted.class);
        assertThatThrownBy(() -> setup.sendTestEmail(new SetupAccess(true, null), new MailServer("h", 25, "", "", false, false),
                new TestEmail("info@nfnn.cz", "spravce@example.cz"))).isInstanceOf(SetupCompleted.class);
        verifyNoInteractions(mailProbe);
    }

    @Test
    @DisplayName("Given an open setup, when a test e-mail is sent, then it goes through the typed server to the typed administrator")
    void should_send_test_email_when_asked_given_open_setup() {
        MailServer server = new MailServer("smtp-relay.brevo.com", 587, "user", "key", true, true);
        TestEmail email = new TestEmail("info@nfnn.cz", "spravce@example.cz");
        when(mailProbe.sendTestEmail(server, email)).thenReturn(TestEmailOutcome.SENT);

        assertThat(setup.sendTestEmail(new SetupAccess(true, null), server, email))
                .isEqualTo(new TestEmailResult(TestEmailOutcome.SENT, "spravce@example.cz"));
    }

    @Test
    @DisplayName("Given a locked setup, when a test e-mail is asked for without the code, then it is refused before anything is sent")
    void should_refuse_test_email_when_asked_given_locked_setup() {
        assertThatThrownBy(() -> setup.sendTestEmail(new SetupAccess(false, "WRONG"), new MailServer("h", 25, "", "", false, false),
                new TestEmail("info@nfnn.cz", "x@example.cz"))).isInstanceOf(SetupLocked.class);
        verifyNoInteractions(mailProbe);
    }

    private static final class FakeSetupState implements SetupStateRepository {

        private Optional<Instant> completedAt = Optional.empty();

        @Override
        public boolean isCompleted() {
            return completedAt.isPresent();
        }

        @Override
        public void markCompleted(Instant at) {
            completedAt = Optional.of(at);
        }
    }

    @Test
    @DisplayName("Given an open setup, when a backup is uploaded from the home network, then it is stored, a restore is requested and the backend restarts")
    void should_request_restore_when_uploaded_given_open_setup() {
        InputStream dump = new ByteArrayInputStream(new byte[] {'P', 'G', 'D', 'M', 'P'});
        when(backups.storeUpload(any(), eq(dump), eq(Optional.empty()))).thenAnswer(call -> call.getArgument(0) + ".upload");

        RestoreRequest request = setup.restoreUpload(new SetupAccess(true, null), dump, Optional.empty());

        assertThat(request.source()).isEqualTo(RestoreSource.UPLOAD);
        verify(backups).requestRestore(request);
        verify(restarter).restartAfterCommit();
    }

    @Test
    @DisplayName("Given a locked or completed setup, when a backup is uploaded, then it is refused before anything is read")
    void should_refuse_upload_when_uploaded_given_locked_or_completed_setup() {
        InputStream dump = new ByteArrayInputStream(new byte[] {'P', 'G', 'D', 'M', 'P'});

        assertThatThrownBy(() -> setup.restoreUpload(new SetupAccess(false, "AAAA-AAAA-AAAA"), dump, Optional.empty())).isInstanceOf(SetupLocked.class);
        setup.complete(new SetupAccess(true, null), ESSENTIALS, KEY_CHECK);
        assertThatThrownBy(() -> setup.restoreUpload(new SetupAccess(true, null), dump, Optional.empty())).isInstanceOf(SetupCompleted.class);

        verify(backups, never()).storeUpload(any(), any(), any());
    }

    @Test
    @DisplayName("Given a last restore, when the status is asked, then it names the restore while the setup is open and nothing once it is done")
    void should_name_last_restore_when_asked_given_open_setup() {
        BackupRun failed = new BackupRun(RunOutcome.FAILED, NOW, NOW, Optional.of("u.upload"), Optional.empty(), Optional.empty(),
                Optional.of("019a1b2c-0000-7000-8000-000000000003"), Optional.empty(), Optional.of("pg_restore: error: x"));
        when(backups.lastRestore()).thenReturn(Optional.of(failed));

        assertThat(setup.status(true).lastRestore()).contains(failed);
        setup.complete(new SetupAccess(true, null), ESSENTIALS, KEY_CHECK);
        assertThat(setup.status(true).lastRestore()).isEmpty();
    }
}
