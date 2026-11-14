package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.UnaryOperator;

@Component
public class HistoryImportTracker {

    private final AtomicLong ids = new AtomicLong();
    private final AtomicReference<HistoryImportRun> last = new AtomicReference<>();

    public Optional<HistoryImportRun> last() {
        return Optional.ofNullable(last.get());
    }

    boolean current(long runId) {
        HistoryImportRun run = last.get();
        return run != null && run.id() == runId && run.pending();
    }

    public HistoryImportRun queue(ImportPeriod requested, boolean needsUnlockedHistory, Instant requestedAt, Instant startsAt) {
        HistoryImportRun run = HistoryImportRun.queued(ids.incrementAndGet(), requested, needsUnlockedHistory, requestedAt, startsAt);
        last.set(run);
        return run;
    }

    void started(long runId) {
        update(runId, run -> run.status() == HistoryImportStatus.QUEUED ? run.running() : run);
    }

    void finished(long runId, ImportReport report, Instant at) {
        update(runId, run -> {
            if (run.status() != HistoryImportStatus.RUNNING) {
                return run;
            }
            if (report.completed()) {
                return run.completed(report.counts().incomingNew(), at);
            }
            ImportFailureKind kind = report.failure().orElseThrow();
            return report.followUp().map(followUp -> run.waitingUntil(followUp.at())).orElseGet(() -> run.failed(kind, at));
        });
    }

    void abandoned(long runId, ImportFailureKind kind, Instant at) {
        update(runId, run -> run.pending() ? run.failed(kind, at) : run);
    }

    private void update(long runId, UnaryOperator<HistoryImportRun> change) {
        last.updateAndGet(run -> run == null || run.id() != runId ? run : change.apply(run));
    }
}
