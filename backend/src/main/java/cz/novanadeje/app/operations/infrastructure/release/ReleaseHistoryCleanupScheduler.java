package cz.novanadeje.app.operations.infrastructure.release;

import cz.novanadeje.app.operations.application.release.ReleaseHistoryPurge;
import cz.novanadeje.app.operations.application.release.ReleaseHistoryService;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class ReleaseHistoryCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReleaseHistoryCleanupScheduler.class);

    private final ReleaseHistoryService service;

    ReleaseHistoryCleanupScheduler(ReleaseHistoryService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.operations.release-history.cleanup-cron}", zone = FoundationZone.ID)
    void deleteEndedRuns() {
        try {
            ReleaseHistoryPurge purge = service.deleteEndedRuns();
            if (purge.deleted() > 0) {
                log.info("Deleted {} release history entries that ended before {}", purge.deleted(), purge.endedBefore());
            } else {
                log.debug("No release history entry ended before {}", purge.endedBefore());
            }
        } catch (RuntimeException failure) {
            log.error("Deleting ended release history entries failed: {}; retrying at the next run", failure.getClass().getSimpleName());
        }
    }
}
