package cz.novanadeje.app.donations.infrastructure.banklogo;

import cz.novanadeje.app.donations.application.banklogo.BankLogoCheck;
import cz.novanadeje.app.donations.application.banklogo.BankLogoRefreshService;
import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
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
import java.time.Instant;

@Component
@Conditional(BankLogoScheduleCondition.class)
class BankLogoScheduler {

    static final Duration DELAY_AFTER_START = Duration.ofMinutes(2);
    static final Duration RUN_BUDGET = Duration.ofSeconds(30);

    private static final Logger log = LoggerFactory.getLogger(BankLogoScheduler.class);
    private static final String KEEPING = "; keeping the stored image";

    private final BankLogoRefreshService service;
    private final TaskScheduler taskScheduler;
    private final Clock clock;

    BankLogoScheduler(BankLogoRefreshService service, TaskScheduler taskScheduler, Clock clock) {
        this.service = service;
        this.taskScheduler = taskScheduler;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    void refreshSoonAfterStart() {
        taskScheduler.schedule(this::refresh, clock.instant().plus(DELAY_AFTER_START));
    }

    @Scheduled(cron = "${app.donations.bank-logos.cron}", zone = FoundationZone.ID)
    void refresh() {
        try {
            Instant stop = clock.instant().plus(RUN_BUDGET);
            for (BankCode code : service.due()) {
                if (!clock.instant().isBefore(stop)) {
                    return;
                }
                refresh(code);
            }
        } catch (RuntimeException unexpected) {
            log.error("Bank logo refresh failed unexpectedly: {}" + KEEPING + "s", unexpected.getClass().getSimpleName());
        }
    }

    private void refresh(BankCode code) {
        try {
            BankLogoCheck check = service.refresh(code);
            switch (check) {
                case FETCHED -> log.info("Bank logo {} fetched", code.value());
                case UNCHANGED -> log.info("Bank logo {} unchanged", code.value());
                case SKIPPED -> {
                }
            }
        } catch (BankLogoUnavailable unavailable) {
            log.warn("Bank logo {} could not be fetched: {}" + KEEPING, code.value(), unavailable.failure().word());
        } catch (RuntimeException unexpected) {
            log.error("Bank logo {} refresh failed unexpectedly: {}" + KEEPING, code.value(), unexpected.getClass().getSimpleName());
        }
    }
}
