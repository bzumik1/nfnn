package cz.novanadeje.app.donations.infrastructure.receipt;

import cz.novanadeje.app.donations.application.receipt.YearlyReceiptAnnouncementService;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Conditional(YearlyReceiptAnnouncementScheduleCondition.class)
class YearlyReceiptAnnouncementScheduler {

    private static final Logger log = LoggerFactory.getLogger(YearlyReceiptAnnouncementScheduler.class);

    private final YearlyReceiptAnnouncementService service;

    YearlyReceiptAnnouncementScheduler(YearlyReceiptAnnouncementService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.donations.yearly-receipt-announcement.cron}", zone = FoundationZone.ID)
    void announceDue() {
        try {
            service.announceDue().ifPresent(announced -> log.info("Yearly receipts of {} announced to {} donors", announced.year(), announced.donors()));
        } catch (RuntimeException unexpected) {
            log.warn("Yearly receipt announcement failed: {}; retrying at the next check", unexpected.getClass().getSimpleName());
        }
    }
}
