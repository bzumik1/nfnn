package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupRequestKind;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import cz.novanadeje.app.operations.domain.backup.RestoreFile;

import java.io.InputStream;
import java.util.List;
import java.util.Optional;

public interface BackupStore {

    boolean isAvailable();

    List<BackupFile> backupsNewestFirst();

    Optional<BackupRun> lastBackup();

    Optional<BackupRun> lastTestRestore();

    Optional<BackupRun> lastRestore();

    List<RestoreFile> restoreFilesNewestFirst();

    int pendingRequests();

    void request(BackupRequestKind kind, String requestId);

    Optional<BackupDownload> open(String fileName);

    boolean restorePending();

    void requestRestore(RestoreRequest request);

    String storeUpload(String requestId, InputStream content, Optional<BackupKey> key);

    void publishSchedule(BackupSchedule schedule);

    Optional<BackupSchedule> appliedSchedule();
}
