package cz.novanadeje.app.donations.domain.importing;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

public final class BankImportState {

    public static final int MAX_FAILURE_MESSAGE_LENGTH = 1000;
    public static final int FAILURES_BEFORE_OUTAGE = 3;

    private static final Set<ImportFailureKind> PASSING_FAILURES = EnumSet.of(ImportFailureKind.RATE_LIMITED, ImportFailureKind.HISTORY_LOCKED);

    private ImportCoverage coverage;
    private Instant lastAttemptedAt;
    private Instant lastSucceededAt;
    private ImportFailureKind lastFailureKind;
    private String lastFailureMessage;
    private int consecutiveFailures;
    private ImportFailureKind reportedOutage;
    private Instant updatedAt;

    private BankImportState(ImportCoverage coverage, Instant lastAttemptedAt, Instant lastSucceededAt,
                            ImportFailureKind lastFailureKind, String lastFailureMessage, int consecutiveFailures,
                            ImportFailureKind reportedOutage, Instant updatedAt) {
        if (consecutiveFailures < 0) {
            throw new IllegalArgumentException("The failure count cannot be negative, but is " + consecutiveFailures);
        }
        this.coverage = require(coverage, "Coverage");
        this.lastAttemptedAt = lastAttemptedAt;
        this.lastSucceededAt = lastSucceededAt;
        this.lastFailureKind = lastFailureKind;
        this.lastFailureMessage = cut(lastFailureMessage);
        this.consecutiveFailures = consecutiveFailures;
        this.reportedOutage = reportedOutage;
        this.updatedAt = require(updatedAt, "Update time");
    }

    public static BankImportState initial(Instant at) {
        return new BankImportState(ImportCoverage.none(), null, null, null, null, 0, null, at);
    }

    public static BankImportState reconstitute(ImportCoverage coverage, Optional<Instant> lastAttemptedAt, Optional<Instant> lastSucceededAt,
                                               Optional<ImportFailureKind> lastFailureKind, Optional<String> lastFailureMessage,
                                               int consecutiveFailures, Optional<ImportFailureKind> reportedOutage, Instant updatedAt) {
        return new BankImportState(coverage, lastAttemptedAt.orElse(null), lastSucceededAt.orElse(null),
                lastFailureKind.orElse(null), lastFailureMessage.orElse(null), consecutiveFailures, reportedOutage.orElse(null), updatedAt);
    }

    public Optional<ImportRecovery> succeeded(ImportCoverage newCoverage, Instant at) {
        Optional<Instant> successBefore = lastSucceededAt();
        int failures = consecutiveFailures;
        ImportFailureKind outage = reportedOutage;
        coverage = require(newCoverage, "Coverage");
        lastAttemptedAt = require(at, "Attempt time");
        lastSucceededAt = at;
        lastFailureKind = null;
        lastFailureMessage = null;
        consecutiveFailures = 0;
        reportedOutage = null;
        updatedAt = at;
        return Optional.ofNullable(outage).map(kind -> new ImportRecovery(kind, failures, successBefore, at));
    }

    public Optional<ImportOutage> failed(ImportFailureKind kind, String message, Instant at) {
        lastFailureKind = require(kind, "Failure kind");
        lastFailureMessage = cut(message);
        lastAttemptedAt = require(at, "Attempt time");
        updatedAt = at;
        if (PASSING_FAILURES.contains(kind)) {
            return Optional.empty();
        }
        consecutiveFailures++;
        if (!startsOutage(kind)) {
            return Optional.empty();
        }
        reportedOutage = kind;
        return Optional.of(new ImportOutage(kind, consecutiveFailures, lastSucceededAt(), at));
    }

    private boolean startsOutage(ImportFailureKind kind) {
        if (reportedOutage == null) {
            return kind == ImportFailureKind.UNAUTHORIZED || consecutiveFailures >= FAILURES_BEFORE_OUTAGE;
        }
        return kind == ImportFailureKind.UNAUTHORIZED && reportedOutage != ImportFailureKind.UNAUTHORIZED;
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

    public int consecutiveFailures() {
        return consecutiveFailures;
    }

    public Optional<ImportFailureKind> reportedOutage() {
        return Optional.ofNullable(reportedOutage);
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
