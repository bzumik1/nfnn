package cz.novanadeje.app.donors.infrastructure.reminder;

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

    RegistrationReminderScheduler(DonorRegistrationReminderService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.donors.registration-reminder.cron}", zone = FOUNDATION_ZONE)
    void remindUnconfirmedRegistrations() {
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
