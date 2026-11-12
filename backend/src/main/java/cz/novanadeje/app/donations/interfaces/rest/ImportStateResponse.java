package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.importing.ImportStatusView;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;

import java.time.Instant;
import java.time.LocalDate;

public record ImportStateResponse(LocalDate coveredFrom, LocalDate coveredTo, Instant lastAttemptedAt, Instant lastSucceededAt,
                                  LastFailure lastFailure, int consecutiveFailures, ImportFailureKind reportedOutage,
                                  HistoryImportResponse historyImport, LocalDate defaultHistoryFrom, Balance balance) {

    public record LastFailure(ImportFailureKind kind, String message, Instant attemptedAt) {
    }

    public record Balance(long amountMinor, Instant readAt) {
    }

    static ImportStateResponse from(ImportStatusView view) {
        ImportStateRow stored = ImportStateRow.from(view.state());
        return new ImportStateResponse(stored.coveredFrom(), stored.coveredTo(), stored.lastAttemptedAt(), stored.lastSucceededAt(),
                stored.lastFailure(), stored.consecutiveFailures(), stored.reportedOutage(),
                view.historyImport().map(HistoryImportResponse::from).orElse(null), view.defaultHistoryFrom(), stored.balance());
    }
}
