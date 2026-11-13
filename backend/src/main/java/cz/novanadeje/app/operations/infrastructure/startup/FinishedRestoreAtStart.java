package cz.novanadeje.app.operations.infrastructure.startup;

import cz.novanadeje.app.operations.application.backup.BackupRestoreService;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class FinishedRestoreAtStart {

    private final BackupRestoreService restores;

    FinishedRestoreAtStart(BackupRestoreService restores) {
        this.restores = restores;
    }

    @EventListener(ApplicationReadyEvent.class)
    void recordFinishedRestore() {
        restores.recordFinishedRestore();
    }
}
