package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupKind;
import cz.novanadeje.app.operations.domain.backup.BackupRequestKind;
import cz.novanadeje.app.operations.domain.backup.BackupsUnavailable;
import cz.novanadeje.app.operations.domain.backup.RestoreFile;
import cz.novanadeje.app.operations.domain.backup.RestoreFileState;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;

class FileBackupStoreTest {

    private static final Instant OLDER = Instant.parse("2026-10-22T01:00:00Z");
    private static final Instant NEWER = Instant.parse("2026-10-23T01:00:00Z");

    @TempDir
    Path root;

    private Path backups;
    private Path restore;
    private FileBackupStore store;

    @BeforeEach
    void createFolders() throws IOException {
        backups = Files.createDirectories(root.resolve("backups"));
        restore = Files.createDirectories(root.resolve("restore"));
        store = new FileBackupStore(properties(backups, restore));
    }

    @Test
    @DisplayName("Given dumps and other files in the folder, when the backups are listed, then only the dumps come, newest first, with size and kind")
    void should_list_dumps_newest_first_when_listed_given_mixed_files() throws IOException {
        write(backups.resolve("nfnn-2026-10-22_0300.dump"), 1000, OLDER);
        write(backups.resolve("nfnn-2026-10-23_0300.dump"), 1590, NEWER);
        write(backups.resolve("nfnn-2026-10-23_0633-rucni.dump"), 1590, NEWER.plusSeconds(60));
        write(backups.resolve("nfnn.dump.part"), 5, NEWER);
        write(backups.resolve("notes.txt"), 5, NEWER);
        Files.createDirectories(backups.resolve("status"));

        List<BackupFile> listed = store.backupsNewestFirst();

        assertThat(listed).extracting(BackupFile::name).containsExactly("nfnn-2026-10-23_0633-rucni.dump", "nfnn-2026-10-23_0300.dump",
                "nfnn-2026-10-22_0300.dump");
        assertThat(listed.getFirst().kind()).isEqualTo(BackupKind.REQUESTED);
        assertThat(listed.getFirst().sizeBytes()).isEqualTo(1590);
        assertThat(listed.getLast().createdAt()).isEqualTo(OLDER);
    }

    @Test
    @DisplayName("Given the status files written by the script, when the runs are read, then each status comes from its file")
    void should_read_runs_when_asked_given_status_files() throws IOException {
        Path status = Files.createDirectories(backups.resolve("status"));
        Files.writeString(status.resolve("backup"), "outcome=ok\nstarted_at=2026-10-23T01:00:00Z\nfinished_at=2026-10-23T01:00:03Z\nfile=nfnn-2026-10-23_0300.dump\nsize=1590\nrequest=\n");
        Files.writeString(status.resolve("test-restore"), "outcome=failed\nstarted_at=2026-10-18T02:00:00Z\nfinished_at=2026-10-18T02:00:01Z\nerror=no backup to restore\n");
        Files.writeString(status.resolve("backup.err"), "garbage");

        assertThat(store.lastBackup()).hasValueSatisfying(run -> {
            assertThat(run.outcome()).isEqualTo(RunOutcome.OK);
            assertThat(run.fileName()).contains("nfnn-2026-10-23_0300.dump");
        });
        assertThat(store.lastTestRestore()).hasValueSatisfying(run -> assertThat(run.error()).contains("no backup to restore"));
        assertThat(store.lastRestore()).isEmpty();
    }

    @Test
    @DisplayName("Given dumps in every state in the restore folder, when they are listed, then each has its state, newest change first")
    void should_list_restore_files_when_listed_given_every_state() throws IOException {
        write(restore.resolve("zaloha.dump"), 10, NEWER);
        write(restore.resolve("stara.dump.done"), 10, OLDER);
        write(restore.resolve("spatna.dump.failed"), 10, OLDER.plusSeconds(1));
        write(restore.resolve("a.dump.skipped"), 10, OLDER.plusSeconds(2));
        write(restore.resolve("README.txt"), 10, NEWER);

        List<RestoreFile> listed = store.restoreFilesNewestFirst();

        assertThat(listed).extracting(RestoreFile::name, RestoreFile::state).containsExactly(
                tuple("zaloha.dump", RestoreFileState.PENDING),
                tuple("a.dump.skipped", RestoreFileState.SKIPPED),
                tuple("spatna.dump.failed", RestoreFileState.FAILED),
                tuple("stara.dump.done", RestoreFileState.DONE));
        assertThat(listed.getFirst().pending()).isTrue();
    }

    @Test
    @DisplayName("Given the requests folder exists, when a backup is requested, then an empty file named after the request is created and counted")
    void should_write_request_file_when_requested_given_requests_folder() throws IOException {
        Files.createDirectories(backups.resolve("requests"));

        store.request(BackupRequestKind.BACKUP, "0199f3e0-0000-7000-8000-000000000001");
        store.request(BackupRequestKind.TEST_RESTORE, "0199f3e0-0000-7000-8000-000000000002");

        assertThat(backups.resolve("requests/0199f3e0-0000-7000-8000-000000000001.backup")).isEmptyFile();
        assertThat(backups.resolve("requests/0199f3e0-0000-7000-8000-000000000002.test-restore")).isEmptyFile();
        assertThat(store.pendingRequests()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given no requests folder, when a backup is requested, then the backups are unavailable")
    void should_refuse_request_when_requested_given_no_requests_folder() {
        assertThatThrownBy(() -> store.request(BackupRequestKind.BACKUP, "x")).isInstanceOf(BackupsUnavailable.class);
        assertThat(store.pendingRequests()).isZero();
    }

    @Test
    @DisplayName("Given the backup folder does not exist, when asked, then the store is unavailable and lists nothing")
    void should_be_unavailable_when_asked_given_no_folder() {
        FileBackupStore missing = new FileBackupStore(properties(root.resolve("nowhere"), root.resolve("nowhere-either")));

        assertThat(missing.isAvailable()).isFalse();
        assertThat(missing.backupsNewestFirst()).isEmpty();
        assertThat(missing.restoreFilesNewestFirst()).isEmpty();
        assertThat(missing.lastBackup()).isEmpty();
        assertThat(store.isAvailable()).isTrue();
    }

    @Test
    @DisplayName("Given a dump in the folder, when it is opened, then its path and size come back; an unknown or odd name opens nothing")
    void should_open_dump_when_opened_given_it_exists() throws IOException {
        write(backups.resolve("nfnn-2026-10-23_0300.dump"), 1590, NEWER);

        assertThat(store.open("nfnn-2026-10-23_0300.dump")).hasValueSatisfying(download -> {
            assertThat(download.path()).isEqualTo(backups.resolve("nfnn-2026-10-23_0300.dump"));
            assertThat(download.file().sizeBytes()).isEqualTo(1590);
        });
        assertThat(store.open("nfnn-2026-10-22_0300.dump")).isEmpty();
        assertThat(store.open("../restore/zaloha.dump")).isEmpty();
    }

    private static BackupProperties properties(Path backups, Path restore) {
        return new BackupProperties(backups, restore, "-", Duration.ofHours(26), Duration.ofDays(8));
    }

    private static void write(Path file, int size, Instant modified) throws IOException {
        Files.write(file, new byte[size]);
        Files.setLastModifiedTime(file, FileTime.from(modified));
    }
}
