package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;

import java.time.Instant;
import java.util.Optional;

public class BankStatementUnavailable extends RuntimeException {

    private final ImportFailureKind kind;
    private final Instant retryAfter;
    private final String description;

    public BankStatementUnavailable(ImportFailureKind kind, Optional<Instant> retryAfter, String description, Throwable cause) {
        super(description, cause);
        if (kind == null || retryAfter == null || description == null) {
            throw new IllegalArgumentException("An unavailable statement needs its failure kind, an optional retry time and its description");
        }
        this.kind = kind;
        this.retryAfter = retryAfter.orElse(null);
        this.description = description;
    }

    public ImportFailureKind kind() {
        return kind;
    }

    public Optional<Instant> retryAfter() {
        return Optional.ofNullable(retryAfter);
    }

    public String description() {
        return description;
    }
}
