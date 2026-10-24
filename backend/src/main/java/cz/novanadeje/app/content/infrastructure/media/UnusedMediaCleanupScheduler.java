package cz.novanadeje.app.content.infrastructure.media;

import cz.novanadeje.app.content.application.media.MediaCleanup;
import cz.novanadeje.app.content.application.media.UnusedMediaCleanupService;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class UnusedMediaCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(UnusedMediaCleanupScheduler.class);

    private final UnusedMediaCleanupService service;

    UnusedMediaCleanupScheduler(UnusedMediaCleanupService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.content.media-cleanup.cron}", zone = FoundationZone.ID)
    void deleteUnusedMedia() {
        try {
            MediaCleanup cleanup = service.deleteUnusedMedia();
            if (cleanup.deleted() > 0) {
                log.info("Deleted {} unused photos uploaded before {}", cleanup.deleted(), cleanup.uploadedBefore());
            } else {
                log.debug("No unused photo uploaded before {} to delete", cleanup.uploadedBefore());
            }
        } catch (RuntimeException failure) {
            log.error("Deleting unused photos failed: {}; retrying at the next run", failure.getClass().getSimpleName());
        }
    }
}
