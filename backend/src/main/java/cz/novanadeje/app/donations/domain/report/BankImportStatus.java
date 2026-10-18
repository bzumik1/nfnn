package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.importing.BankImportState;

import java.time.Instant;
import java.util.Optional;

public record BankImportStatus(Optional<Instant> lastSucceededAt, Optional<ImportFailure> lastFailure) {

    public BankImportStatus {
        if (lastSucceededAt == null || lastFailure == null) {
            throw new IllegalArgumentException("The last success and the last failure are given, even when absent");
        }
    }

    public static BankImportStatus of(BankImportState state) {
        Optional<ImportFailure> failure = state.lastFailureKind()
                .flatMap(kind -> state.lastAttemptedAt().map(attemptedAt -> new ImportFailure(kind, attemptedAt)));
        return new BankImportStatus(state.lastSucceededAt(), failure);
    }
}
