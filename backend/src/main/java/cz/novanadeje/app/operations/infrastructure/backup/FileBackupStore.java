package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupDownload;
import cz.novanadeje.app.operations.application.backup.BackupStore;
import cz.novanadeje.app.operations.application.backup.RestoreRequest;
import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupRequestKind;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.BackupTooLarge;
import cz.novanadeje.app.operations.domain.backup.BackupsUnavailable;
import cz.novanadeje.app.operations.domain.backup.NotABackup;
import cz.novanadeje.app.operations.domain.backup.RestoreFile;
import cz.novanadeje.app.operations.domain.backup.RestoreFileState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.stream.Stream;

@Component
class FileBackupStore implements BackupStore {

    static final String STATUS_DIRECTORY = "status";
    static final String REQUESTS_DIRECTORY = "requests";
    static final String BACKUP_STATUS = "backup";
    static final String TEST_RESTORE_STATUS = "test-restore";
    static final String RESTORE_STATUS = "restore";
    static final String RESTORE_RUNNING = "restore.running";
    static final String RESTORE_REQUEST_EXTENSION = ".restore";
    static final String UPLOAD_EXTENSION = ".upload";

    private static final byte[] DUMP_MAGIC = "PGDMP".getBytes(StandardCharsets.US_ASCII);
    private static final int COPY_BUFFER = 64 * 1024;

    private static final Logger log = LoggerFactory.getLogger(FileBackupStore.class);

    private final Path directory;
    private final Path restoreDirectory;
    private final long maxUploadBytes;

    FileBackupStore(BackupProperties properties) {
        this.directory = properties.directory();
        this.restoreDirectory = properties.restoreDirectory();
        this.maxUploadBytes = properties.maxUploadSize().toBytes();
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
        return (int) list(directory.resolve(REQUESTS_DIRECTORY),
                path -> requestKind(fileName(path)).isPresent() || fileName(path).endsWith(RESTORE_REQUEST_EXTENSION)).count();
    }

    @Override
    public boolean restorePending() {
        return Files.exists(directory.resolve(STATUS_DIRECTORY).resolve(RESTORE_RUNNING))
                || list(directory.resolve(REQUESTS_DIRECTORY), path -> fileName(path).endsWith(RESTORE_REQUEST_EXTENSION)).findAny().isPresent();
    }

    @Override
    public void requestRestore(RestoreRequest request) {
        Path requests = directory.resolve(REQUESTS_DIRECTORY);
        if (!Files.isDirectory(requests)) {
            throw new BackupsUnavailable();
        }
        String content = "source=" + request.source().requestValue() + "\n"
                + "file=" + request.fileName() + "\n"
                + "admin=" + request.requestedBy().map(UUID::toString).orElse("") + "\n";
        Path part = requests.resolve(request.id() + RESTORE_REQUEST_EXTENSION + ".part");
        try {
            Files.writeString(part, content, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
            Files.move(part, requests.resolve(request.id() + RESTORE_REQUEST_EXTENSION), StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException notWritable) {
            deleteQuietly(part);
            log.error("The restore request {} could not be written", request.id(), notWritable);
            throw new BackupsUnavailable();
        }
    }

    @Override
    public String storeUpload(String requestId, InputStream content) {
        if (!Files.isDirectory(restoreDirectory)) {
            throw new BackupsUnavailable();
        }
        String name = requestId + UPLOAD_EXTENSION;
        Path part = restoreDirectory.resolve(name + ".part");
        try {
            copyDump(content, part);
            Files.move(part, restoreDirectory.resolve(name), StandardCopyOption.ATOMIC_MOVE);
            return name;
        } catch (NotABackup | BackupTooLarge refused) {
            deleteQuietly(part);
            throw refused;
        } catch (IOException notWritable) {
            deleteQuietly(part);
            log.error("The uploaded backup {} could not be stored", requestId, notWritable);
            throw new BackupsUnavailable();
        }
    }

    private void copyDump(InputStream content, Path target) throws IOException {
        byte[] magic = content.readNBytes(DUMP_MAGIC.length);
        if (!Arrays.equals(magic, DUMP_MAGIC)) {
            throw new NotABackup();
        }
        try (OutputStream out = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) {
            out.write(magic);
            long written = magic.length;
            byte[] buffer = new byte[COPY_BUFFER];
            int read;
            while ((read = content.read(buffer)) != -1) {
                written += read;
                if (written > maxUploadBytes) {
                    throw new BackupTooLarge();
                }
                out.write(buffer, 0, read);
            }
        }
    }

    private static void deleteQuietly(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException undeletable) {
            log.warn("The unfinished file {} could not be deleted", file.getFileName());
        }
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
