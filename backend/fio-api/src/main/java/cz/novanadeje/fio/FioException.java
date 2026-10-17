package cz.novanadeje.fio;

import java.util.Optional;
import java.util.OptionalInt;

public sealed class FioException extends RuntimeException
        permits FioRateLimitException, FioAuthorizationException, FioHistoryLockedException, FioTransportException {

    private final Integer statusCode;
    private final String responseBody;

    public FioException(String message, int statusCode, String responseBody) {
        this(message, statusCode, responseBody, null);
    }

    public FioException(String message, int statusCode, String responseBody, Throwable cause) {
        super(message, cause);
        this.statusCode = statusCode;
        this.responseBody = responseBody;
    }

    FioException(String message, Throwable cause) {
        super(message, cause);
        this.statusCode = null;
        this.responseBody = null;
    }

    public OptionalInt statusCode() {
        return statusCode == null ? OptionalInt.empty() : OptionalInt.of(statusCode);
    }

    public Optional<String> responseBody() {
        return Optional.ofNullable(responseBody);
    }
}
