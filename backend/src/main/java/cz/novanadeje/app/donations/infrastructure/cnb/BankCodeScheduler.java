package cz.novanadeje.app.donations.infrastructure.cnb;

import cz.novanadeje.app.donations.application.bankcode.BankCodeRefresh;
import cz.novanadeje.app.donations.application.bankcode.BankCodeRefreshService;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSourceUnavailable;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
@Conditional(BankCodeScheduleCondition.class)
class BankCodeScheduler {

    static final Duration DELAY_AFTER_START = Duration.ofMinutes(2);

    private static final Logger log = LoggerFactory.getLogger(BankCodeScheduler.class);
    private static final String KEEPING = "; keeping the stored list until the next run";

    private final BankCodeRefreshService service;
    private final TaskScheduler taskScheduler;
    private final Clock clock;

    BankCodeScheduler(BankCodeRefreshService service, TaskScheduler taskScheduler, Clock clock) {
        this.service = service;
        this.taskScheduler = taskScheduler;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    void refreshSoonAfterStart() {
        taskScheduler.schedule(this::refresh, clock.instant().plus(DELAY_AFTER_START));
    }

    @Scheduled(cron = "${app.donations.bank-codes.cron}", zone = FoundationZone.ID)
    void refresh() {
        guarded(() -> {
            if (service.isDue()) {
                logOutcome(service.refresh());
            }
        });
    }

    private static void guarded(Runnable work) {
        try {
            work.run();
        } catch (BankCodeSourceUnavailable unavailable) {
            log.warn("Bank code list could not be fetched: {}" + KEEPING, unavailable.getMessage());
        } catch (RuntimeException unexpected) {
            log.error("Bank code list refresh failed unexpectedly: {}" + KEEPING, unexpected.getClass().getSimpleName());
        }
    }

    private static void logOutcome(BankCodeRefresh refresh) {
        if (refresh.changed()) {
            log.info("Bank code list fetched: {} codes", refresh.count());
        } else {
            log.info("Bank code list unchanged at the source");
        }
    }
}
