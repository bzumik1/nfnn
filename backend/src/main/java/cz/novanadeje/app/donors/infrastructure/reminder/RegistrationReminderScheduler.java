package cz.novanadeje.app.donors.infrastructure.reminder;

import cz.novanadeje.app.donors.application.DonorRegistrationExpiryService;
import cz.novanadeje.app.donors.application.DonorRegistrationReminderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class RegistrationReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(RegistrationReminderScheduler.class);
    private static final String FOUNDATION_ZONE = "Europe/Prague";

    private final DonorRegistrationReminderService service;
    private final DonorRegistrationExpiryService expiry;

    RegistrationReminderScheduler(DonorRegistrationReminderService service, DonorRegistrationExpiryService expiry) {
        this.service = service;
        this.expiry = expiry;
    }

    @Scheduled(cron = "${app.donors.registration-reminder.cron}", zone = FOUNDATION_ZONE)
    void tendUnconfirmedRegistrations() {
        deleteExpiredRegistrations();
        remindUnconfirmedRegistrations();
    }

    private void deleteExpiredRegistrations() {
        try {
            int deleted = expiry.expireUnconfirmed();
            if (deleted > 0) {
                log.info("Deleted {} unconfirmed registrations older than {} days", deleted, DonorRegistrationExpiryService.RETENTION.toDays());
            } else {
                log.debug("No unconfirmed registration to delete");
            }
        } catch (RuntimeException failure) {
            log.error("Deleting expired unconfirmed registrations failed: {}; retrying at the next run", failure.getClass().getSimpleName());
        }
    }

    private void remindUnconfirmedRegistrations() {
        try {
            int reminded = service.remindUnconfirmed();
            if (reminded > 0) {
                log.info("Reminded {} unconfirmed registrations", reminded);
            } else {
                log.debug("No unconfirmed registration to remind");
            }
        } catch (RuntimeException failure) {
            log.error("Reminding unconfirmed registrations failed: {}; retrying at the next run", failure.getClass().getSimpleName());
        }
    }
}
