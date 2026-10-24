package cz.novanadeje.app.donors.infrastructure.startup;

import cz.novanadeje.app.donors.application.PasskeySiteCleanupService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class PasskeySiteCleanupAtStartTest {

    private final PasskeySiteCleanupService cleanup = mock(PasskeySiteCleanupService.class);
    private final PasskeySiteCleanupAtStart listener = new PasskeySiteCleanupAtStart(cleanup);

    @Test
    @DisplayName("Given the backend has started, when it is ready, then the passkeys of other site addresses are removed")
    void should_remove_keys_of_other_sites_when_ready() {
        listener.cleanUpAtStart();

        verify(cleanup).removeKeysOfOtherSites();
    }

    @Test
    @DisplayName("Given the clean-up fails, when the backend is ready, then the start goes on")
    void should_not_fail_the_start_when_ready_given_the_clean_up_fails() {
        doThrow(new IllegalStateException("database")).when(cleanup).removeKeysOfOtherSites();

        assertThatCode(listener::cleanUpAtStart).doesNotThrowAnyException();
    }
}
