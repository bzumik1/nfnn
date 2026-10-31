package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.application.backup.BackupKeyService;
import cz.novanadeje.app.operations.application.backup.RevealedBackupKey;
import cz.novanadeje.app.operations.application.backup.BackupRestoreService;
import cz.novanadeje.app.operations.application.backup.BackupStore;
import cz.novanadeje.app.operations.application.backup.RestoreRequest;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupKeyUnavailable;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWordCheck;
import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.operations.domain.settings.SetupCode;
import cz.novanadeje.app.operations.domain.settings.SetupCompleted;
import cz.novanadeje.app.operations.domain.settings.SetupLocked;
import cz.novanadeje.app.operations.domain.settings.SetupStateRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class SetupService {

    private static final Logger log = LoggerFactory.getLogger(SetupService.class);

    private final SetupStateRepository state;
    private final SettingsWriter writer;
    private final SetupCodeAnnouncer announcer;
    private final MailServerProbe mailProbe;
    private final ApplicationRestarter restarter;
    private final BackupStore backups;
    private final BackupRestoreService restores;
    private final BackupKeyService backupKeys;
    private final Clock clock;
    private final SetupCode code;

    public SetupService(SetupStateRepository state, SettingsWriter writer, SetupCodeAnnouncer announcer, MailServerProbe mailProbe,
                        ApplicationRestarter restarter, BackupStore backups, BackupRestoreService restores, BackupKeyService backupKeys,
                        Clock clock) {
        this.state = state;
        this.writer = writer;
        this.announcer = announcer;
        this.mailProbe = mailProbe;
        this.restarter = restarter;
        this.backups = backups;
        this.restores = restores;
        this.backupKeys = backupKeys;
        this.clock = clock;
        this.code = SetupCode.generate(new SecureRandom());
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional(readOnly = true)
    public void announceCodeWhileRequired() {
        if (!state.isCompleted()) {
            announcer.announce(code);
            log.info("The first setup is not done yet; it opens from the home network or with the code in the container log");
        }
    }

    @Transactional(readOnly = true)
    public SetupStatusView status(boolean fromHomeNetwork) {
        boolean required = !state.isCompleted();
        return new SetupStatusView(required, required && !fromHomeNetwork, required ? backups.lastRestore() : Optional.empty());
    }

    @Transactional(readOnly = true)
    public void unlock(SetupAccess access) {
        requireOpen(access);
    }

    public TestEmailResult sendTestEmail(SetupAccess access, MailServer server, TestEmail email) {
        requireOpen(access);
        TestEmailOutcome outcome = mailProbe.sendTestEmail(server, email);
        log.info("A test e-mail was sent in the first setup: {}", outcome);
        return new TestEmailResult(outcome, email.recipient());
    }

    @Transactional(readOnly = true)
    public RevealedBackupKey backupKey(SetupAccess access) {
        requireOpen(access);
        return backupKeys.keyForSetup().orElseThrow(BackupKeyUnavailable::new);
    }

    @Transactional
    public List<Setting> complete(SetupAccess access, List<SettingChange> changes, List<BackupKeyWordCheck> backupKeyWords) {
        requireOpen(access);
        List<SettingError> foreign = changes.stream()
                .filter(change -> !Setting.inSetup().contains(change.setting()))
                .map(change -> SettingError.of(change.setting(), SettingProblem.NOT_IN_SETUP))
                .toList();
        if (!foreign.isEmpty()) {
            throw new SettingsRejected(foreign);
        }
        Instant now = clock.instant();
        backupKeys.confirmInSetup(backupKeyWords, now);
        List<Setting> changed = writer.apply(changes, Setting.requiredInSetup(), now);
        state.markCompleted(now);
        restarter.restartAfterCommit();
        log.info("The first setup was completed {}; settings stored: {}; the backend restarts",
                access.fromHomeNetwork() ? "from the home network" : "with the setup code",
                changed.stream().map(Enum::name).collect(Collectors.joining(", ")));
        return changed;
    }

    public RestoreRequest restoreUpload(SetupAccess access, InputStream content, Optional<BackupKey> key) {
        requireOpen(access);
        log.info("A backup is uploaded in the first setup {}", access.fromHomeNetwork() ? "from the home network" : "with the setup code");
        return restores.restoreUpload(content, key);
    }

    private void requireOpen(SetupAccess access) {
        if (state.isCompleted()) {
            throw new SetupCompleted();
        }
        if (!access.fromHomeNetwork() && !code.matches(access.code())) {
            throw new SetupLocked();
        }
    }
}
