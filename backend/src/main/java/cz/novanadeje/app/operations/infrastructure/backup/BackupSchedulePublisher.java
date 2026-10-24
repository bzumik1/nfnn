package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupScheduleService;
import cz.novanadeje.app.operations.domain.backup.BackupsUnavailable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class BackupSchedulePublisher {

    private static final Logger log = LoggerFactory.getLogger(BackupSchedulePublisher.class);

    private final BackupScheduleService schedules;

    BackupSchedulePublisher(BackupScheduleService schedules) {
        this.schedules = schedules;
    }

    @EventListener(ApplicationReadyEvent.class)
    void publishAtStart() {
        try {
            schedules.publishPlanned();
            log.info("Handed the backup schedule to the backup container");
        } catch (BackupsUnavailable unavailable) {
            log.warn("The backup schedule was not handed to the backup container: the backup folder is not connected");
        } catch (RuntimeException unexpected) {
            log.error("Handing the backup schedule to the backup container failed; it is handed over again at the next start", unexpected);
        }
    }
}
