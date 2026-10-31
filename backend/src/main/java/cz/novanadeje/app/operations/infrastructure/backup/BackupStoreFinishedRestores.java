package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupStore;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.shared.application.restore.FinishedRestore;
import cz.novanadeje.app.shared.application.restore.FinishedRestores;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
class BackupStoreFinishedRestores implements FinishedRestores {

    private static final Logger log = LoggerFactory.getLogger(BackupStoreFinishedRestores.class);

    private final BackupStore store;

    BackupStoreFinishedRestores(BackupStore store) {
        this.store = store;
    }

    @Override
    public Optional<FinishedRestore> lastSucceeded() {
        return store.lastRestore().filter(BackupRun::succeeded).flatMap(BackupStoreFinishedRestores::named);
    }

    private static Optional<FinishedRestore> named(BackupRun run) {
        String id = run.requestId().orElseGet(() -> run.finishedAt().toString());
        if (id.length() > FinishedRestore.MAX_ID_LENGTH) {
            log.warn("The last restore names a request id of {} characters, more than {}, so it confirms no receipt signing key", id.length(),
                    FinishedRestore.MAX_ID_LENGTH);
            return Optional.empty();
        }
        return Optional.of(new FinishedRestore(id, run.finishedAt()));
    }
}
