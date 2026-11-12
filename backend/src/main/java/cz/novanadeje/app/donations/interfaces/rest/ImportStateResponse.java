package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.importing.ImportStatusView;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
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
        BankImportState state = view.state();
        LastFailure failure = state.lastFailureKind()
                .map(kind -> new LastFailure(kind, state.lastFailureMessage().orElse(null), state.lastAttemptedAt().orElse(null)))
                .orElse(null);
        return new ImportStateResponse(state.coverage().coveredFrom(), state.coverage().coveredTo(), state.lastAttemptedAt().orElse(null),
                state.lastSucceededAt().orElse(null), failure, state.consecutiveFailures(), state.reportedOutage().orElse(null),
                view.historyImport().map(HistoryImportResponse::from).orElse(null), view.defaultHistoryFrom(), balanceOf(state));
    }

    static Balance balanceOf(BankImportState state) {
        return state.balance().map(balance -> new Balance(balance.amount().amountMinor(), balance.readAt())).orElse(null);
    }
}
