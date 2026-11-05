package cz.novanadeje.app.donors.infrastructure.session;

import cz.novanadeje.app.donors.application.DonorSessionCleanupService;
import cz.novanadeje.app.donors.application.DonorSessionCleanupService.SessionCleanup;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class SessionCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(SessionCleanupScheduler.class);

    private final DonorSessionCleanupService service;

    SessionCleanupScheduler(DonorSessionCleanupService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.donors.session-cleanup.cron}", zone = FoundationZone.ID)
    void cleanUpSessions() {
        try {
            SessionCleanup cleanup = service.cleanUp();
            log.info("Session cleanup ended {} expired devices, deleted {} spent refresh tokens and {} ended devices",
                    cleanup.expiredDevices(), cleanup.deletedTokens(), cleanup.deletedDevices());
        } catch (RuntimeException failure) {
            log.error("Session cleanup failed: {}; retrying at the next run", failure.getClass().getSimpleName());
        }
    }
}
