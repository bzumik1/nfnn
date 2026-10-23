package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupWatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Conditional(BackupWatchScheduleCondition.class)
class BackupWatchScheduler {

    private static final Logger log = LoggerFactory.getLogger(BackupWatchScheduler.class);

    private final BackupWatchService service;

    BackupWatchScheduler(BackupWatchService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.operations.backups.check-cron}", zone = BackupFormats.ZONE_ID)
    void checkBackups() {
        try {
            service.check();
        } catch (RuntimeException unexpected) {
            log.error("The backup check failed unexpectedly; retrying at the next check", unexpected);
        }
    }
}
