package cz.novanadeje.app.donations.infrastructure.fio;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.FollowUp;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import cz.novanadeje.app.donations.application.importing.ImportReport;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

@Component
@Conditional(FioTokenPresentCondition.class)
class FioImportScheduler {

    static final int MAX_FOLLOW_UPS_PER_TICK = 3;

    private static final Logger log = LoggerFactory.getLogger(FioImportScheduler.class);
    private static final String UNLOCK_HISTORY = "unlock the history in Fio internet banking (Nastavení > API, the lock icon) "
            + "and restart the backend within 10 minutes, or shorten FIO_HISTORY_FROM";
    private static final String RENEW_TOKEN = "the Fio token is missing, not yet active or expired (180 days): "
            + "create a new one in Fio internet banking and set FIO_TOKEN";

    private final ImportBankPaymentsService service;
    private final BankImportProperties importProperties;
    private final TaskScheduler taskScheduler;
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicBoolean started = new AtomicBoolean();
    private final AtomicReference<ScheduledFuture<?>> pendingFollowUp = new AtomicReference<>();
    private final AtomicInteger followUpsSinceTick = new AtomicInteger();

    FioImportScheduler(ImportBankPaymentsService service, BankImportProperties importProperties, TaskScheduler taskScheduler) {
        this.service = service;
        this.importProperties = importProperties;
        this.taskScheduler = taskScheduler;
    }

    @Scheduled(initialDelayString = "${app.donations.fio.initial-delay}", fixedDelayString = "${app.donations.fio.interval}")
    void tick() {
        cancel(pendingFollowUp.getAndSet(null));
        followUpsSinceTick.set(0);
        run(started.compareAndSet(false, true) ? ImportTrigger.STARTUP : ImportTrigger.HOURLY);
    }

    void run(ImportTrigger trigger) {
        if (!running.compareAndSet(false, true)) {
            log.warn("Fio import {} skipped, previous import still running", trigger);
            return;
        }
        try {
            ImportReport report = service.importIncomingPayments(trigger, importProperties.toSettings());
            report.failure().ifPresent(kind -> logFailure(report, kind));
            report.followUp().ifPresent(this::scheduleFollowUp);
        } catch (RuntimeException unexpected) {
            log.error("Fio import {} failed unexpectedly", trigger, unexpected);
        } finally {
            running.set(false);
        }
    }

    private void scheduleFollowUp(FollowUp followUp) {
        int followUps = followUpsSinceTick.incrementAndGet();
        if (followUps > MAX_FOLLOW_UPS_PER_TICK) {
            log.warn("Fio refused {} follow-ups in a row; waiting for the next hourly run", followUps);
            return;
        }
        ScheduledFuture<?> next = taskScheduler.schedule(() -> run(followUp.trigger()), followUp.at());
        cancel(pendingFollowUp.getAndSet(next));
    }

    private void logFailure(ImportReport report, ImportFailureKind kind) {
        String next = report.followUp()
                .map(followUp -> "follow-up " + followUp.trigger() + " at " + followUp.at())
                .orElse("retrying at the next hourly run");
        switch (kind) {
            case RATE_LIMITED, TRANSPORT -> log.warn("Fio import {} {} failed with {}; {}", report.trigger(), report.requested(), kind, next);
            case HISTORY_LOCKED -> {
                if (report.needsUnlockedHistory()) {
                    log.warn("Fio import {} {} failed with {}: {}; {}", report.trigger(), report.requested(), kind, UNLOCK_HISTORY, next);
                }
            }
            case UNAUTHORIZED -> log.error("Fio import {} {} failed with {}: {}; {}", report.trigger(), report.requested(), kind, RENEW_TOKEN, next);
            case INVALID_RESPONSE, UNEXPECTED -> log.error("Fio import {} {} failed with {}; {}", report.trigger(), report.requested(), kind, next);
        }
    }

    private static void cancel(ScheduledFuture<?> followUp) {
        if (followUp != null) {
            followUp.cancel(false);
        }
    }
}
