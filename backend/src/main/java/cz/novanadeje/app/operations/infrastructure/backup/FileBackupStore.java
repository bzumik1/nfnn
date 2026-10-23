package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupDownload;
import cz.novanadeje.app.operations.application.backup.BackupStore;
import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupRequestKind;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.BackupsUnavailable;
import cz.novanadeje.app.operations.domain.backup.RestoreFile;
import cz.novanadeje.app.operations.domain.backup.RestoreFileState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.stream.Stream;

@Component
class FileBackupStore implements BackupStore {

    static final String STATUS_DIRECTORY = "status";
    static final String REQUESTS_DIRECTORY = "requests";
    static final String BACKUP_STATUS = "backup";
    static final String TEST_RESTORE_STATUS = "test-restore";
    static final String RESTORE_STATUS = "restore";

    private static final Logger log = LoggerFactory.getLogger(FileBackupStore.class);

    private final Path directory;
    private final Path restoreDirectory;

    FileBackupStore(BackupProperties properties) {
        this.directory = properties.directory();
        this.restoreDirectory = properties.restoreDirectory();
    }

    @Override
    public boolean isAvailable() {
        return Files.isDirectory(directory);
    }

    @Override
    public List<BackupFile> backupsNewestFirst() {
        return list(directory, path -> BackupFile.isValidName(fileName(path)))
                .map(path -> new BackupFile(fileName(path), size(path), lastModified(path)))
                .sorted(Comparator.comparing(BackupFile::createdAt).thenComparing(BackupFile::name).reversed())
                .toList();
    }

    @Override
    public Optional<BackupRun> lastBackup() {
        return StatusFiles.read(directory.resolve(STATUS_DIRECTORY).resolve(BACKUP_STATUS));
    }

    @Override
    public Optional<BackupRun> lastTestRestore() {
        return StatusFiles.read(directory.resolve(STATUS_DIRECTORY).resolve(TEST_RESTORE_STATUS));
    }

    @Override
    public Optional<BackupRun> lastRestore() {
        return StatusFiles.read(directory.resolve(STATUS_DIRECTORY).resolve(RESTORE_STATUS));
    }

    @Override
    public List<RestoreFile> restoreFilesNewestFirst() {
        return list(restoreDirectory, path -> RestoreFileState.ofFileName(fileName(path)).isPresent())
                .map(path -> new RestoreFile(fileName(path), RestoreFileState.ofFileName(fileName(path)).orElseThrow(), lastModified(path)))
                .sorted(Comparator.comparing(RestoreFile::changedAt).thenComparing(RestoreFile::name).reversed())
                .toList();
    }

    @Override
    public int pendingRequests() {
        return (int) list(directory.resolve(REQUESTS_DIRECTORY), path -> requestKind(fileName(path)).isPresent()).count();
    }

    @Override
    public void request(BackupRequestKind kind, String requestId) {
        Path requests = directory.resolve(REQUESTS_DIRECTORY);
        if (!Files.isDirectory(requests)) {
            throw new BackupsUnavailable();
        }
        try {
            Files.write(requests.resolve(requestId + "." + kind.fileExtension()), new byte[0], StandardOpenOption.CREATE_NEW);
        } catch (IOException notWritable) {
            log.error("The backup request {} could not be written", requestId, notWritable);
            throw new BackupsUnavailable();
        }
    }

    @Override
    public Optional<BackupDownload> open(String fileName) {
        if (!BackupFile.isValidName(fileName)) {
            return Optional.empty();
        }
        Path path = directory.resolve(fileName);
        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }
        return Optional.of(new BackupDownload(new BackupFile(fileName, size(path), lastModified(path)), path));
    }

    private static Optional<BackupRequestKind> requestKind(String fileName) {
        for (BackupRequestKind kind : BackupRequestKind.values()) {
            if (fileName.endsWith("." + kind.fileExtension())) {
                return Optional.of(kind);
            }
        }
        return Optional.empty();
    }

    private static Stream<Path> list(Path folder, Predicate<Path> filter) {
        if (!Files.isDirectory(folder)) {
            return Stream.empty();
        }
        try (Stream<Path> entries = Files.list(folder)) {
            return entries.filter(Files::isRegularFile).filter(filter).toList().stream();
        } catch (IOException unreadable) {
            log.warn("The folder {} cannot be listed: {}", folder.getFileName(), unreadable.getClass().getSimpleName());
            return Stream.empty();
        }
    }

    private static String fileName(Path path) {
        return path.getFileName().toString();
    }

    private static long size(Path path) {
        try {
            return Files.size(path);
        } catch (IOException unreadable) {
            return 0;
        }
    }

    private static Instant lastModified(Path path) {
        try {
            return Files.getLastModifiedTime(path).toInstant();
        } catch (IOException unreadable) {
            return FileTime.fromMillis(0).toInstant();
        }
    }
}
