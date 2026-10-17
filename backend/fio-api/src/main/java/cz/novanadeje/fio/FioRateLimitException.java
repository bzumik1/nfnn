package cz.novanadeje.fio;

import java.time.Instant;

import static java.util.Objects.requireNonNull;

public final class FioRateLimitException extends FioException {

    private static final int CONFLICT = 409;

    private final Instant retryAfter;

    public FioRateLimitException(String message, String responseBody, Instant retryAfter) {
        super(message, CONFLICT, responseBody);
        this.retryAfter = requireNonNull(retryAfter, "retryAfter");
    }

    public Instant retryAfter() {
        return retryAfter;
    }
}
