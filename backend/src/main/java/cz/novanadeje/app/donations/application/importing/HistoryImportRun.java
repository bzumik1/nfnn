package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;

import java.time.Instant;
import java.util.Optional;

public record HistoryImportRun(ImportPeriod requested, boolean needsUnlockedHistory, Instant requestedAt, Instant startsAt,
                               HistoryImportStatus status, Optional<ImportFailureKind> failure, Optional<Integer> added,
                               Optional<Instant> finishedAt) {

    public HistoryImportRun {
        if (requested == null || requestedAt == null || startsAt == null || status == null) {
            throw new IllegalArgumentException("A history import run needs its period, its times and its status");
        }
        if (failure == null || added == null || finishedAt == null) {
            throw new IllegalArgumentException("The outcome of a history import run is optional, never null");
        }
    }

    public static HistoryImportRun queued(ImportPeriod requested, boolean needsUnlockedHistory, Instant requestedAt, Instant startsAt) {
        return new HistoryImportRun(requested, needsUnlockedHistory, requestedAt, startsAt, HistoryImportStatus.QUEUED,
                Optional.empty(), Optional.empty(), Optional.empty());
    }

    public boolean pending() {
        return status == HistoryImportStatus.QUEUED || status == HistoryImportStatus.RUNNING;
    }

    HistoryImportRun running() {
        return withStatus(HistoryImportStatus.RUNNING, startsAt, Optional.empty(), Optional.empty(), Optional.empty());
    }

    HistoryImportRun waitingUntil(Instant at) {
        return withStatus(HistoryImportStatus.QUEUED, at, Optional.empty(), Optional.empty(), Optional.empty());
    }

    HistoryImportRun completed(int newPayments, Instant at) {
        return withStatus(HistoryImportStatus.COMPLETED, startsAt, Optional.empty(), Optional.of(newPayments), Optional.of(at));
    }

    HistoryImportRun failed(ImportFailureKind kind, Instant at) {
        HistoryImportStatus outcome = kind == ImportFailureKind.HISTORY_LOCKED ? HistoryImportStatus.HISTORY_LOCKED : HistoryImportStatus.FAILED;
        return withStatus(outcome, startsAt, Optional.of(kind), Optional.empty(), Optional.of(at));
    }

    private HistoryImportRun withStatus(HistoryImportStatus next, Instant nextStart, Optional<ImportFailureKind> kind, Optional<Integer> newPayments,
                                        Optional<Instant> at) {
        return new HistoryImportRun(requested, needsUnlockedHistory, requestedAt, nextStart, next, kind, newPayments, at);
    }
}
