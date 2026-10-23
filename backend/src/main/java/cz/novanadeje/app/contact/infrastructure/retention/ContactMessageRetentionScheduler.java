package cz.novanadeje.app.contact.infrastructure.retention;

import cz.novanadeje.app.contact.application.ContactMessagePurge;
import cz.novanadeje.app.contact.application.ContactMessageRetentionService;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class ContactMessageRetentionScheduler {

    private static final Logger log = LoggerFactory.getLogger(ContactMessageRetentionScheduler.class);

    private final ContactMessageRetentionService service;

    ContactMessageRetentionScheduler(ContactMessageRetentionService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.contact.retention.cron}", zone = FoundationZone.ID)
    void deleteExpiredMessages() {
        try {
            ContactMessagePurge purge = service.deleteExpiredMessages();
            if (purge.deleted() > 0) {
                log.info("Deleted {} contact messages received before {}", purge.deleted(), purge.receivedBefore());
            } else {
                log.debug("No contact message received before {} to delete", purge.receivedBefore());
            }
        } catch (RuntimeException failure) {
            log.error("Deleting expired contact messages failed: {}; retrying at the next run", failure.getClass().getSimpleName());
        }
    }
}
