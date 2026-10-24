package cz.novanadeje.app.donors.infrastructure.startup;

import cz.novanadeje.app.donors.application.PasskeySiteCleanupService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class PasskeySiteCleanupAtStart {

    private static final Logger log = LoggerFactory.getLogger(PasskeySiteCleanupAtStart.class);

    private final PasskeySiteCleanupService cleanup;

    PasskeySiteCleanupAtStart(PasskeySiteCleanupService cleanup) {
        this.cleanup = cleanup;
    }

    @EventListener(ApplicationReadyEvent.class)
    void cleanUpAtStart() {
        try {
            cleanup.removeKeysOfOtherSites();
        } catch (RuntimeException unexpected) {
            log.error("Removing the passkeys of other site addresses failed with {}; it is tried again at the next start", unexpected.getClass().getName());
        }
    }
}
