package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.importing.HistoryImportRun;
import cz.novanadeje.app.donations.application.importing.HistoryImportStatus;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;

import java.time.Instant;
import java.time.LocalDate;

public record HistoryImportResponse(LocalDate from, LocalDate to, boolean needsUnlockedHistory, Instant requestedAt, Instant startsAt,
                                    HistoryImportStatus status, ImportFailureKind failure, Integer added, Instant finishedAt) {

    static HistoryImportResponse from(HistoryImportRun run) {
        return new HistoryImportResponse(run.requested().from(), run.requested().to(), run.needsUnlockedHistory(), run.requestedAt(),
                run.startsAt(), run.status(), run.failure().orElse(null), run.added().orElse(null), run.finishedAt().orElse(null));
    }
}
