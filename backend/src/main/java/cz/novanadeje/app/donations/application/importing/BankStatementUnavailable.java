package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;

import java.time.Instant;
import java.util.Optional;

public class BankStatementUnavailable extends RuntimeException {

    private final ImportFailureKind kind;
    private final Instant retryAfter;

    public BankStatementUnavailable(ImportFailureKind kind, Optional<Instant> retryAfter, String message, Throwable cause) {
        super(message, cause);
        if (kind == null || retryAfter == null) {
            throw new IllegalArgumentException("An unavailable statement needs its failure kind and an optional retry time");
        }
        this.kind = kind;
        this.retryAfter = retryAfter.orElse(null);
    }

    public ImportFailureKind kind() {
        return kind;
    }

    public Optional<Instant> retryAfter() {
        return Optional.ofNullable(retryAfter);
    }
}
