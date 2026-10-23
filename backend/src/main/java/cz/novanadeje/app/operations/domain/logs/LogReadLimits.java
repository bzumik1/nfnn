package cz.novanadeje.app.operations.domain.logs;

public final class LogReadLimits {

    public static final int DEFAULT_WINDOW_BYTES = 20_000;
    public static final int MAX_WINDOW_BYTES = 200_000;
    public static final int DEFAULT_MATCHES = 50;
    public static final int MAX_MATCHES = 200;
    public static final int MAX_LINE_LENGTH = 2_000;
    public static final int MAX_PATTERN_LENGTH = 200;
    public static final java.time.Duration SEARCH_TIME = java.time.Duration.ofSeconds(5);

    private LogReadLimits() {
    }

    public static int windowBytes(Integer requested) {
        return requested == null ? DEFAULT_WINDOW_BYTES : Math.clamp(requested, 1, MAX_WINDOW_BYTES);
    }

    public static int matches(Integer requested) {
        return requested == null ? DEFAULT_MATCHES : Math.clamp(requested, 1, MAX_MATCHES);
    }
}
