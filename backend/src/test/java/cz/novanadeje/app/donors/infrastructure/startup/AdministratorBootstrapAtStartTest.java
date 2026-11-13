package cz.novanadeje.app.donors.infrastructure.startup;

import cz.novanadeje.app.donors.application.AdministratorBootstrap;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AdministratorBootstrapAtStartTest {

    private final AdministratorBootstrap bootstrap = mock(AdministratorBootstrap.class);
    private final AdministratorBootstrapAtStart listener = new AdministratorBootstrapAtStart(bootstrap);

    @Test
    @DisplayName("Given the backend has started, when it is ready, then the configured administrators are granted the role")
    void should_grant_configured_administrators_when_ready() {
        listener.grantConfiguredAdministrators();

        verify(bootstrap).run();
    }
}
