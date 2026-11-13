package cz.novanadeje.app.operations.infrastructure.startup;

import cz.novanadeje.app.operations.application.backup.BackupRestoreService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class FinishedRestoreAtStartTest {

    private final BackupRestoreService restores = mock(BackupRestoreService.class);
    private final FinishedRestoreAtStart listener = new FinishedRestoreAtStart(restores);

    @Test
    @DisplayName("Given the backend has started, when it is ready, then a finished restore is recorded")
    void should_record_finished_restore_when_ready() {
        listener.recordFinishedRestore();

        verify(restores).recordFinishedRestore();
    }
}
