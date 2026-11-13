package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class ImportFollowUps {

    public static final int MAX_IN_A_ROW = 3;

    private static final Logger log = LoggerFactory.getLogger(ImportFollowUps.class);

    private final HistoryImportTracker historyImports;
    private final BankImportProperties properties;
    private final Clock clock;
    private final AtomicInteger sinceScheduledRun = new AtomicInteger();
    private final AtomicReference<HistoryFollowUps> historyFollowUps = new AtomicReference<>(new HistoryFollowUps(0, 0));

    public ImportFollowUps(HistoryImportTracker historyImports, BankImportProperties properties, Clock clock) {
        this.historyImports = historyImports;
        this.properties = properties;
        this.clock = clock;
    }

    public void scheduledRunStarted() {
        sinceScheduledRun.set(0);
    }

    public Optional<FollowUp> after(ImportReport report) {
        Optional<FollowUp> followUp = report.followUp();
        if (followUp.isEmpty()) {
            return Optional.empty();
        }
        int followUps = sinceScheduledRun.incrementAndGet();
        if (followUps > MAX_IN_A_ROW) {
            log.warn("Fio refused {} follow-ups in a row; waiting for the next hourly run", followUps);
            return Optional.empty();
        }
        return followUp;
    }

    public boolean due(HistoryImportRun run) {
        return historyImports.current(run.id());
    }

    public Optional<Instant> afterHistory(HistoryImportRun run, ImportReport report) {
        Optional<FollowUp> followUp = report.followUp();
        if (followUp.isEmpty() || !due(run)) {
            return Optional.empty();
        }
        int followUps = historyFollowUps.updateAndGet(counted -> counted.next(run.id())).count();
        if (followUps > MAX_IN_A_ROW) {
            log.warn("Fio import HISTORY put off {} times in a row; it waits to be requested again", followUps);
            historyImports.abandoned(run.id(), ImportFailureKind.RATE_LIMITED, clock.instant());
            return Optional.empty();
        }
        return followUp.map(FollowUp::at);
    }

    public Instant putOffWhileBusy() {
        return clock.instant().plus(properties.onDemandCooldown());
    }

    public void notRescheduled(HistoryImportRun run) {
        historyImports.abandoned(run.id(), ImportFailureKind.UNEXPECTED, clock.instant());
    }

    private record HistoryFollowUps(long runId, int count) {

        HistoryFollowUps next(long forRun) {
            return new HistoryFollowUps(forRun, forRun == runId ? count + 1 : 1);
        }
    }
}
