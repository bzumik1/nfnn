package cz.novanadeje.app.donations.infrastructure.fio;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.BankImportRequests;
import cz.novanadeje.app.donations.application.importing.HistoryImportRun;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import cz.novanadeje.app.donations.application.importing.ImportFollowUps;
import cz.novanadeje.app.donations.application.importing.ImportReport;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import cz.novanadeje.app.shared.application.event.LiveFeed;
import cz.novanadeje.app.shared.application.event.StoredDataChanged;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.function.Supplier;

@Component
@Conditional(FioTokenPresentCondition.class)
class FioImportScheduler implements BankImportRequests {

    private static final Logger log = LoggerFactory.getLogger(FioImportScheduler.class);
    private static final String UNLOCK_HISTORY = "unlock the history in Fio internet banking (Nastavení > API, the lock icon) "
            + "and press Načíst starší platby on /sprava within 10 minutes";
    private static final String RENEW_TOKEN = "the Fio token is missing, not yet active or expired (180 days): "
            + "create a new one in Fio internet banking and set FIO_TOKEN";

    private final ImportBankPaymentsService service;
    private final BankImportProperties importProperties;
    private final TaskScheduler taskScheduler;
    private final Clock clock;
    private final ApplicationEventPublisher events;
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicBoolean onDemandPending = new AtomicBoolean();
    private final AtomicBoolean started = new AtomicBoolean();
    private final AtomicReference<ScheduledFuture<?>> pendingFollowUp = new AtomicReference<>();
    private final AtomicReference<HistoryImportRun> pendingHistoryRun = new AtomicReference<>();
    private final AtomicBoolean historyRunQueued = new AtomicBoolean();
    private final AtomicReference<ScheduledFuture<?>> pendingHistoryFollowUp = new AtomicReference<>();
    private final ImportFollowUps followUps;

    FioImportScheduler(ImportBankPaymentsService service, BankImportProperties importProperties, TaskScheduler taskScheduler,
                       ImportFollowUps followUps, Clock clock, ApplicationEventPublisher events) {
        this.service = service;
        this.importProperties = importProperties;
        this.taskScheduler = taskScheduler;
        this.followUps = followUps;
        this.clock = clock;
        this.events = events;
    }

    @Scheduled(initialDelayString = "${app.donations.fio.initial-delay}", fixedDelayString = "${app.donations.fio.interval}")
    void tick() {
        cancel(pendingFollowUp.getAndSet(null));
        followUps.scheduledRunStarted();
        run(started.compareAndSet(false, true) ? ImportTrigger.STARTUP : ImportTrigger.HOURLY);
    }

    @Override
    public void requestImport() {
        if (!onDemandPending.compareAndSet(false, true)) {
            return;
        }
        try {
            taskScheduler.schedule(this::runOnDemand, clock.instant());
        } catch (RuntimeException rejected) {
            onDemandPending.set(false);
            throw rejected;
        }
    }

    @Override
    public boolean inProgress() {
        return onDemandPending.get() || historyRunQueued.get() || running.get() || pending(pendingFollowUp) || pending(pendingHistoryFollowUp);
    }

    @Override
    public boolean enabled() {
        return true;
    }

    @Override
    public void requestHistoryImport(HistoryImportRun run) {
        if (pendingHistoryRun.accumulateAndGet(run, FioImportScheduler::newer) != run) {
            return;
        }
        cancel(pendingHistoryFollowUp.getAndSet(null));
        if (!historyRunQueued.compareAndSet(false, true)) {
            return;
        }
        try {
            taskScheduler.schedule(this::runQueuedHistory, run.startsAt());
        } catch (RuntimeException rejected) {
            historyRunQueued.set(false);
            pendingHistoryRun.set(null);
            throw rejected;
        }
    }

    void run(ImportTrigger trigger) {
        try {
            execute(trigger, () -> Optional.of(service.importIncomingPayments(trigger, importProperties.toSettings())));
        } finally {
            importEnded();
        }
    }

    private void runQueuedHistory() {
        historyRunQueued.set(false);
        HistoryImportRun run = pendingHistoryRun.getAndSet(null);
        if (run != null) {
            runHistory(run);
        }
    }

    private void runHistory(HistoryImportRun run) {
        if (!followUps.due(run)) {
            return;
        }
        boolean ran;
        try {
            ran = execute(ImportTrigger.HISTORY, () -> Optional.of(service.importHistory(run, importProperties.toSettings())),
                    report -> followUps.afterHistory(run, report).ifPresent(at -> scheduleHistoryRun(run, at)));
        } finally {
            importEnded();
        }
        if (!ran) {
            scheduleHistoryRun(run, followUps.putOffWhileBusy());
        }
    }

    private void runOnDemand() {
        try {
            execute(ImportTrigger.ON_DEMAND, () -> service.importOnDemand(importProperties.toSettings(), importProperties.onDemandCooldown()));
        } finally {
            onDemandPending.set(false);
            importEnded();
        }
    }

    private void importEnded() {
        events.publishEvent(StoredDataChanged.of(LiveFeed.BANK_IMPORT));
    }

    private boolean execute(ImportTrigger trigger, Supplier<Optional<ImportReport>> importer) {
        return execute(trigger, importer, this::scheduleFollowUp);
    }

    private boolean execute(ImportTrigger trigger, Supplier<Optional<ImportReport>> importer, Consumer<ImportReport> next) {
        if (!running.compareAndSet(false, true)) {
            log.warn("Fio import {} skipped, previous import still running", trigger);
            return false;
        }
        try {
            importer.get().ifPresent(report -> {
                report.failure().ifPresent(kind -> logFailure(report, kind));
                next.accept(report);
            });
        } catch (RuntimeException unexpected) {
            log.error("Fio import {} failed unexpectedly: {}", trigger, unexpected.getClass().getName());
        } finally {
            running.set(false);
        }
        return true;
    }

    private void scheduleFollowUp(ImportReport report) {
        followUps.after(report).ifPresent(followUp -> {
            ScheduledFuture<?> next = taskScheduler.schedule(() -> run(followUp.trigger()), followUp.at());
            cancel(pendingFollowUp.getAndSet(next));
        });
    }

    private void scheduleHistoryRun(HistoryImportRun run, Instant at) {
        try {
            cancel(pendingHistoryFollowUp.getAndSet(taskScheduler.schedule(() -> runHistory(run), at)));
        } catch (RuntimeException rejected) {
            log.warn("Fio import HISTORY run {} could not be scheduled again ({}); it ends as failed", run.id(), rejected.getClass().getSimpleName());
            followUps.notRescheduled(run);
        }
    }

    private static HistoryImportRun newer(HistoryImportRun pending, HistoryImportRun offered) {
        return pending != null && pending.id() > offered.id() ? pending : offered;
    }

    private static boolean pending(AtomicReference<ScheduledFuture<?>> followUp) {
        ScheduledFuture<?> future = followUp.get();
        return future != null && !future.isDone();
    }

    private void logFailure(ImportReport report, ImportFailureKind kind) {
        String next = report.followUp()
                .map(followUp -> "follow-up " + followUp.trigger() + " at " + followUp.at())
                .orElse(report.trigger() == ImportTrigger.HISTORY ? "it waits to be requested again" : "retrying at the next hourly run");
        String failure = kind + report.failureMessage().map(message -> " (" + message + ")").orElse("");
        switch (kind) {
            case RATE_LIMITED, TRANSPORT -> log.warn("Fio import {} {} failed with {}; {}", report.trigger(), report.requested(), failure, next);
            case HISTORY_LOCKED -> {
                if (report.needsUnlockedHistory()) {
                    log.warn("Fio import {} {} failed with {}: {}; {}", report.trigger(), report.requested(), failure, UNLOCK_HISTORY, next);
                }
            }
            case UNAUTHORIZED -> log.error("Fio import {} {} failed with {}: {}; {}", report.trigger(), report.requested(), failure, RENEW_TOKEN, next);
            case INVALID_RESPONSE, UNEXPECTED -> log.error("Fio import {} {} failed with {}; {}", report.trigger(), report.requested(), failure, next);
        }
    }

    private static void cancel(ScheduledFuture<?> followUp) {
        if (followUp != null) {
            followUp.cancel(false);
        }
    }
}
