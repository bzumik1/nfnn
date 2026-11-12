package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;

import java.time.Instant;
import java.time.LocalDate;

record ImportStateRow(LocalDate coveredFrom, LocalDate coveredTo, Instant lastAttemptedAt, Instant lastSucceededAt,
                      LastFailure lastFailure, int consecutiveFailures, ImportFailureKind reportedOutage,
                      ImportStateResponse.Balance balance) {

    record LastFailure(ImportFailureKind kind, Instant attemptedAt) {
    }

    static ImportStateRow from(BankImportState state) {
        LastFailure failure = state.lastFailureKind().map(kind -> new LastFailure(kind, state.lastAttemptedAt().orElse(null))).orElse(null);
        return new ImportStateRow(state.coverage().coveredFrom(), state.coverage().coveredTo(), state.lastAttemptedAt().orElse(null),
                state.lastSucceededAt().orElse(null), failure, state.consecutiveFailures(), state.reportedOutage().orElse(null),
                ImportStateResponse.balanceOf(state));
    }
}
