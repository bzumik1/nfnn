package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupStore;
import cz.novanadeje.app.shared.application.restore.FinishedRestore;
import cz.novanadeje.app.shared.application.restore.FinishedRestores;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
class BackupStoreFinishedRestores implements FinishedRestores {

    private final BackupStore store;

    BackupStoreFinishedRestores(BackupStore store) {
        this.store = store;
    }

    @Override
    public Optional<FinishedRestore> lastSucceeded() {
        return Optional.empty();
    }
}
