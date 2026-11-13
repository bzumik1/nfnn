package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupFile;

import java.util.Objects;

public record BackupDownload(BackupFile file, BackupContent content) {

    public BackupDownload {
        Objects.requireNonNull(file, "file");
        Objects.requireNonNull(content, "content");
    }
}
