package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.UnaryOperator;

@Component
public class HistoryImportTracker {

    private final AtomicReference<HistoryImportRun> last = new AtomicReference<>();

    public Optional<HistoryImportRun> last() {
        return Optional.ofNullable(last.get());
    }

    void queued(HistoryImportRun run) {
        last.set(run);
    }

    void started(LocalDate from) {
        update(run -> run.status() == HistoryImportStatus.QUEUED && run.requested().from().equals(from) ? run.running() : run);
    }

    void finished(LocalDate from, ImportReport report, Instant at) {
        update(run -> {
            if (run.status() != HistoryImportStatus.RUNNING || !run.requested().from().equals(from)) {
                return run;
            }
            if (report.completed()) {
                return run.completed(report.counts().incomingNew(), at);
            }
            ImportFailureKind kind = report.failure().orElseThrow();
            return report.followUp().map(followUp -> run.waitingUntil(followUp.at())).orElseGet(() -> run.failed(kind, at));
        });
    }

    public void abandoned(ImportFailureKind kind, Instant at) {
        update(run -> run.pending() ? run.failed(kind, at) : run);
    }

    private void update(UnaryOperator<HistoryImportRun> change) {
        last.updateAndGet(run -> run == null ? null : change.apply(run));
    }
}
