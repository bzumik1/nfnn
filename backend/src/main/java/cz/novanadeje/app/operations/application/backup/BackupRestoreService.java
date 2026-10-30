package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.application.settings.ApplicationRestarter;
import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupNotFound;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RestorePending;
import cz.novanadeje.app.operations.domain.backup.RestoreRecordRepository;
import cz.novanadeje.app.operations.domain.backup.RestoreSource;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class BackupRestoreService {

    static final String RESTORE_BACKUP_ACTION = "RESTORE_BACKUP";
    static final String BACKUP_RESTORED_ACTION = "BACKUP_RESTORED";
    static final String BACKUP_RESTORE_FAILED_ACTION = "BACKUP_RESTORE_FAILED";

    private static final Logger log = LoggerFactory.getLogger(BackupRestoreService.class);

    private final BackupStore store;
    private final RestoreRecordRepository records;
    private final ApplicationRestarter restarter;
    private final ApplicationEventPublisher events;
    private final PublicBackupKeyPolicy publicKeys;
    private final Clock clock;

    public BackupRestoreService(BackupStore store, RestoreRecordRepository records, ApplicationRestarter restarter, ApplicationEventPublisher events,
                                PublicBackupKeyPolicy publicKeys, Clock clock) {
        this.store = store;
        this.records = records;
        this.restarter = restarter;
        this.events = events;
        this.publicKeys = publicKeys;
        this.clock = clock;
    }

    @Transactional
    public RestoreRequest restoreBackup(UUID adminId, String fileName) {
        if (!BackupFile.isValidName(fileName) || store.open(fileName).isEmpty()) {
            throw new BackupNotFound();
        }
        requireNoRestorePending();
        Instant now = clock.instant();
        RestoreRequest request = new RestoreRequest(UuidV7.generate(now).toString(), RestoreSource.BACKUP, fileName, Optional.of(adminId), now);
        store.requestRestore(request);
        events.publishEvent(new AdminActionPerformed(adminId, RESTORE_BACKUP_ACTION, Optional.empty(),
                "Vyžádána obnova ze zálohy " + fileName + " (požadavek " + request.id() + "); backend se restartuje a počká na kontejner záloh", now));
        restarter.restartAfterCommit();
        log.info("Admin {} requested a restore of {} as request {}; the backend restarts", adminId, fileName, request.id());
        return request;
    }

    public RestoreRequest restoreUpload(InputStream content, Optional<BackupKey> key) {
        requireNoRestorePending();
        Instant now = clock.instant();
        String id = UuidV7.generate(now).toString();
        String stored = store.storeUpload(id, content, key);
        RestoreRequest request = new RestoreRequest(id, RestoreSource.UPLOAD, stored, Optional.empty(), now);
        store.requestRestore(request);
        restarter.restartAfterCommit();
        log.info("A backup uploaded in the first setup waits for the backup container as request {}; the backend restarts", id);
        return request;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void recordFinishedRestore() {
        Optional<BackupRun> finished = store.lastRestore();
        if (finished.isEmpty() || finished.get().requestId().isEmpty() || finished.get().requestedBy().isEmpty()) {
            return;
        }
        BackupRun run = finished.get();
        String requestId = run.requestId().orElseThrow();
        Instant now = clock.instant();
        if (!records.recordOnce(requestId, now)) {
            return;
        }
        String file = run.fileName().orElse("an unnamed backup");
        if (run.succeeded()) {
            String tables = run.tables().map(count -> ", tabulek: " + count).orElse("");
            events.publishEvent(new AdminActionPerformed(run.requestedBy().orElseThrow(), BACKUP_RESTORED_ACTION, Optional.empty(),
                    "Databáze obnovena ze zálohy " + file + " (požadavek " + requestId + ")" + tables, now));
            log.info("The restore of {} (request {}) finished and is recorded in the administration history", file, requestId);
        } else {
            events.publishEvent(new AdminActionPerformed(run.requestedBy().orElseThrow(), BACKUP_RESTORE_FAILED_ACTION, Optional.empty(),
                    truncated("Obnova ze zálohy " + file + " (požadavek " + requestId + ") selhala: " + run.error().orElse("neznámá chyba")
                            + "; data zůstala, jak byla"), now));
            log.warn("The restore of {} (request {}) failed; the data stayed as they were", file, requestId);
        }
    }

    private void requireNoRestorePending() {
        if (store.restorePending()) {
            throw new RestorePending();
        }
    }

    private static String truncated(String details) {
        return details.length() <= AdminActionPerformed.MAX_DETAILS_LENGTH ? details : details.substring(0, AdminActionPerformed.MAX_DETAILS_LENGTH);
    }
}
