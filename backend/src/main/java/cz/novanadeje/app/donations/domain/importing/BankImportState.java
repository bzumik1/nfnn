package cz.novanadeje.app.donations.domain.importing;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

public final class BankImportState {

    public static final int MAX_FAILURE_MESSAGE_LENGTH = 1000;

    private ImportCoverage coverage;
    private Instant lastAttemptedAt;
    private Instant lastSucceededAt;
    private ImportFailureKind lastFailureKind;
    private String lastFailureMessage;
    private Instant updatedAt;

    private BankImportState(ImportCoverage coverage, Instant lastAttemptedAt, Instant lastSucceededAt,
                            ImportFailureKind lastFailureKind, String lastFailureMessage, Instant updatedAt) {
        this.coverage = require(coverage, "Coverage");
        this.lastAttemptedAt = lastAttemptedAt;
        this.lastSucceededAt = lastSucceededAt;
        this.lastFailureKind = lastFailureKind;
        this.lastFailureMessage = cut(lastFailureMessage);
        this.updatedAt = require(updatedAt, "Update time");
    }

    public static BankImportState initial(Instant at) {
        return new BankImportState(ImportCoverage.none(), null, null, null, null, at);
    }

    public static BankImportState reconstitute(ImportCoverage coverage, Optional<Instant> lastAttemptedAt, Optional<Instant> lastSucceededAt,
                                               Optional<ImportFailureKind> lastFailureKind, Optional<String> lastFailureMessage,
                                               Instant updatedAt) {
        return new BankImportState(coverage, lastAttemptedAt.orElse(null), lastSucceededAt.orElse(null),
                lastFailureKind.orElse(null), lastFailureMessage.orElse(null), updatedAt);
    }

    public void succeeded(ImportCoverage newCoverage, Instant at) {
        coverage = require(newCoverage, "Coverage");
        lastAttemptedAt = require(at, "Attempt time");
        lastSucceededAt = at;
        lastFailureKind = null;
        lastFailureMessage = null;
        updatedAt = at;
    }

    public void failed(ImportFailureKind kind, String message, Instant at) {
        lastFailureKind = require(kind, "Failure kind");
        lastFailureMessage = cut(message);
        lastAttemptedAt = require(at, "Attempt time");
        updatedAt = at;
    }

    public boolean attemptedWithin(Duration window, Instant now) {
        return lastAttemptedAt != null && lastAttemptedAt.plus(window).isAfter(now);
    }

    public ImportCoverage coverage() {
        return coverage;
    }

    public Optional<Instant> lastAttemptedAt() {
        return Optional.ofNullable(lastAttemptedAt);
    }

    public Optional<Instant> lastSucceededAt() {
        return Optional.ofNullable(lastSucceededAt);
    }

    public Optional<ImportFailureKind> lastFailureKind() {
        return Optional.ofNullable(lastFailureKind);
    }

    public Optional<String> lastFailureMessage() {
        return Optional.ofNullable(lastFailureMessage);
    }

    public Instant updatedAt() {
        return updatedAt;
    }

    private static String cut(String message) {
        if (message == null || message.isBlank()) {
            return null;
        }
        String trimmed = message.trim();
        if (trimmed.codePointCount(0, trimmed.length()) <= MAX_FAILURE_MESSAGE_LENGTH) {
            return trimmed;
        }
        return trimmed.substring(0, trimmed.offsetByCodePoints(0, MAX_FAILURE_MESSAGE_LENGTH));
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
