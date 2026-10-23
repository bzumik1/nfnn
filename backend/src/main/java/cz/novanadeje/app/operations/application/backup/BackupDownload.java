package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupFile;

import java.nio.file.Path;
import java.util.Objects;

public record BackupDownload(BackupFile file, Path path) {

    public BackupDownload {
        Objects.requireNonNull(file, "file");
        Objects.requireNonNull(path, "path");
    }
}
