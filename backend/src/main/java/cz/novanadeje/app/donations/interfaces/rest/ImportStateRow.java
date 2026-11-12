package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;

import java.time.Instant;
import java.time.LocalDate;

record ImportStateRow(LocalDate coveredFrom, LocalDate coveredTo, Instant lastAttemptedAt, Instant lastSucceededAt,
                      ImportStateResponse.LastFailure lastFailure, int consecutiveFailures, ImportFailureKind reportedOutage,
                      ImportStateResponse.Balance balance) {

    static ImportStateRow from(BankImportState state) {
        ImportStateResponse.LastFailure failure = state.lastFailureKind()
                .map(kind -> new ImportStateResponse.LastFailure(kind, state.lastFailureMessage().orElse(null), state.lastAttemptedAt().orElse(null)))
                .orElse(null);
        return new ImportStateRow(state.coverage().coveredFrom(), state.coverage().coveredTo(), state.lastAttemptedAt().orElse(null),
                state.lastSucceededAt().orElse(null), failure, state.consecutiveFailures(), state.reportedOutage().orElse(null),
                state.balance().map(balance -> new ImportStateResponse.Balance(balance.amount().amountMinor(), balance.readAt())).orElse(null));
    }
}
