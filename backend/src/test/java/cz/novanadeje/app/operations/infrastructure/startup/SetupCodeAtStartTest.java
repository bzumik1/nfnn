package cz.novanadeje.app.operations.infrastructure.startup;

import cz.novanadeje.app.operations.application.settings.SetupService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SetupCodeAtStartTest {

    private final SetupService setup = mock(SetupService.class);
    private final SetupCodeAtStart listener = new SetupCodeAtStart(setup);

    @Test
    @DisplayName("Given the backend has started, when it is ready, then the setup code is announced while the first setup is required")
    void should_announce_setup_code_when_ready() {
        listener.announceCodeWhileRequired();

        verify(setup).announceCodeWhileRequired();
    }
}
