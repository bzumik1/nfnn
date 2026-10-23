package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.backup.BackupRun;

import java.util.Objects;
import java.util.Optional;

public record SetupStatusView(boolean required, boolean codeRequired, Optional<BackupRun> lastRestore) {

    public SetupStatusView {
        Objects.requireNonNull(lastRestore, "lastRestore");
    }
}
