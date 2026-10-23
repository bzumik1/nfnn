package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupHealth;
import cz.novanadeje.app.operations.domain.backup.BackupLimits;
import cz.novanadeje.app.operations.domain.backup.BackupNotFound;
import cz.novanadeje.app.operations.domain.backup.BackupRequestKind;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class BackupAdministrationService {

    static final String REQUEST_BACKUP_ACTION = "REQUEST_BACKUP";
    static final String REQUEST_TEST_RESTORE_ACTION = "REQUEST_TEST_RESTORE";
    static final String DOWNLOAD_BACKUP_ACTION = "DOWNLOAD_BACKUP";

    private static final Logger log = LoggerFactory.getLogger(BackupAdministrationService.class);

    private final BackupStore store;
    private final BackupLimits limits;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public BackupAdministrationService(BackupStore store, BackupLimits limits, ApplicationEventPublisher events, Clock clock) {
        this.store = store;
        this.limits = limits;
        this.events = events;
        this.clock = clock;
    }

    public BackupAdministrationView view() {
        if (!store.isAvailable()) {
            return BackupAdministrationView.unavailable();
        }
        List<BackupFile> backups = store.backupsNewestFirst();
        Optional<BackupRun> lastBackup = store.lastBackup();
        Optional<BackupRun> lastTestRestore = store.lastTestRestore();
        BackupHealth health = BackupHealth.assess(lastBackup, lastTestRestore, backups, clock.instant(), limits);
        return new BackupAdministrationView(true, backups, lastBackup, lastTestRestore, store.lastRestore(), store.restoreFilesNewestFirst(),
                store.pendingRequests(), store.restorePending(), health);
    }

    @Transactional
    public BackupRequest request(UUID adminId, BackupRequestKind kind) {
        Instant now = clock.instant();
        String id = UuidV7.generate(now).toString();
        store.request(kind, id);
        String action = kind == BackupRequestKind.BACKUP ? REQUEST_BACKUP_ACTION : REQUEST_TEST_RESTORE_ACTION;
        String what = kind == BackupRequestKind.BACKUP ? "A backup" : "A test restore of the newest backup";
        events.publishEvent(new AdminActionPerformed(adminId, action, Optional.empty(), what + " was requested (request " + id + ")", now));
        log.info("Admin {} requested {} as request {}", adminId, kind, id);
        return new BackupRequest(id, kind, now);
    }

    @Transactional
    public BackupDownload download(UUID adminId, String fileName) {
        if (!BackupFile.isValidName(fileName)) {
            throw new BackupNotFound();
        }
        BackupDownload download = store.open(fileName).orElseThrow(BackupNotFound::new);
        Instant now = clock.instant();
        events.publishEvent(new AdminActionPerformed(adminId, DOWNLOAD_BACKUP_ACTION, Optional.empty(),
                "The backup " + fileName + " (" + download.file().sizeBytes() + " bytes) was downloaded", now));
        log.info("Admin {} downloaded the backup {}", adminId, fileName);
        return download;
    }
}
