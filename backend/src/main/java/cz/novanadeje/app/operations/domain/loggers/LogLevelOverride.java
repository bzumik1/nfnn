package cz.novanadeje.app.operations.domain.loggers;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record LogLevelOverride(LoggerName logger, LogLevel level, Optional<LogLevel> configuredBefore, Instant since, Instant until,
                               UUID adminId) {

    public static final int DEFAULT_MINUTES = 30;
    public static final int MAX_MINUTES = 24 * 60;

    public LogLevelOverride {
        if (logger == null || level == null || configuredBefore == null || since == null || until == null || adminId == null) {
            throw new IllegalArgumentException("A log level override names the logger, the level, what was configured before, its span and who set it");
        }
        if (!until.isAfter(since)) {
            throw new IllegalArgumentException("A log level override lasts for a while");
        }
    }

    public static LogLevelOverride forMinutes(LoggerName logger, LogLevel level, Optional<LogLevel> configuredBefore, Instant now, int minutes,
                                              UUID adminId) {
        if (minutes < 1 || minutes > MAX_MINUTES) {
            throw new IllegalArgumentException("A log level override lasts between 1 minute and 24 hours");
        }
        return new LogLevelOverride(logger, level, configuredBefore, now, now.plus(Duration.ofMinutes(minutes)), adminId);
    }

    public boolean expiredAt(Instant now) {
        return !now.isBefore(until);
    }
}
