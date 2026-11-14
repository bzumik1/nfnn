package cz.novanadeje.app.operations.infrastructure.github;

import cz.novanadeje.app.operations.application.release.ReleaseCheckOutcome;
import cz.novanadeje.app.operations.application.release.ReleaseCheckService;
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
@Conditional(ReleaseCheckScheduleCondition.class)
class ReleaseCheckScheduler {

    static final Duration DELAY_AFTER_START = Duration.ofMinutes(2);

    private static final Logger log = LoggerFactory.getLogger(ReleaseCheckScheduler.class);
    private static final String KEEPING = "; keeping the last known release until the next run";

    private final ReleaseCheckService service;
    private final TaskScheduler taskScheduler;
    private final Clock clock;

    ReleaseCheckScheduler(ReleaseCheckService service, TaskScheduler taskScheduler, Clock clock) {
        this.service = service;
        this.taskScheduler = taskScheduler;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    void checkSoonAfterStart() {
        taskScheduler.schedule(this::check, clock.instant().plus(DELAY_AFTER_START));
    }

    @Scheduled(cron = "${app.operations.releases.cron}", zone = FoundationZone.ID)
    void check() {
        try {
            switch (service.check()) {
                case ReleaseCheckOutcome.Found found -> log.info("Release check: the latest release is {}", found.latest());
                case ReleaseCheckOutcome.Failed failed -> log.warn("Release check failed: {}" + KEEPING, failed.outcome());
            }
        } catch (RuntimeException unexpected) {
            log.error("Release check failed unexpectedly: {}" + KEEPING, unexpected.getClass().getSimpleName());
        }
    }
}
