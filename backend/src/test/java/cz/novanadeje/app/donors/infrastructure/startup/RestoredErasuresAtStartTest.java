package cz.novanadeje.app.donors.infrastructure.startup;

import cz.novanadeje.app.donors.application.RestoredErasures;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RestoredErasuresAtStartTest {

    private final RestoredErasures erasures = mock(RestoredErasures.class);
    private final RestoredErasuresAtStart listener = new RestoredErasuresAtStart(erasures);

    @Test
    @DisplayName("Given the backend has started, when it is ready, then the erasures a restore brought back are completed")
    void should_complete_restored_erasures_when_ready() {
        listener.completeErasuresARestoreBroughtBack();

        verify(erasures).completeErasuresARestoreBroughtBack();
    }
}
