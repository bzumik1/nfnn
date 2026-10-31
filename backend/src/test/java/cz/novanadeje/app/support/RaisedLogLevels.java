package cz.novanadeje.app.support;

import org.springframework.boot.logging.LogLevel;
import org.springframework.boot.logging.LoggerConfiguration;
import org.springframework.boot.logging.LoggingSystem;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

public final class RaisedLogLevels implements AutoCloseable {

    public static final Map<String, LogLevel> FRAMEWORK_AT_DEBUG = levels(Map.of(
            LoggingSystem.ROOT_LOGGER_NAME, LogLevel.DEBUG,
            "org.springframework", LogLevel.DEBUG,
            "org.springframework.web", LogLevel.DEBUG,
            "org.springframework.http", LogLevel.DEBUG,
            "org.springframework.security", LogLevel.DEBUG,
            "org.apache", LogLevel.DEBUG,
            "org.hibernate", LogLevel.DEBUG,
            "tools.jackson", LogLevel.DEBUG));

    public static final Map<String, LogLevel> EVERY_LEVEL_AN_ADMINISTRATOR_CAN_SET = levels(with(FRAMEWORK_AT_DEBUG, "cz.novanadeje.app", LogLevel.TRACE));

    private final LoggingSystem loggingSystem;
    private final Map<String, Optional<LogLevel>> before = new LinkedHashMap<>();

    private RaisedLogLevels(LoggingSystem loggingSystem) {
        this.loggingSystem = loggingSystem;
    }

    public static RaisedLogLevels raise(LoggingSystem loggingSystem, Map<String, LogLevel> levels) {
        RaisedLogLevels raised = new RaisedLogLevels(loggingSystem);
        levels.forEach((logger, level) -> {
            LoggerConfiguration configuration = loggingSystem.getLoggerConfiguration(logger);
            raised.before.put(logger, Optional.ofNullable(configuration).map(LoggerConfiguration::getConfiguredLevel));
            loggingSystem.setLogLevel(logger, level);
        });
        return raised;
    }

    @Override
    public void close() {
        before.forEach((logger, level) -> loggingSystem.setLogLevel(logger, level.orElse(null)));
    }

    private static Map<String, LogLevel> with(Map<String, LogLevel> levels, String logger, LogLevel level) {
        Map<String, LogLevel> more = new LinkedHashMap<>(levels);
        more.put(logger, level);
        return more;
    }

    private static Map<String, LogLevel> levels(Map<String, LogLevel> levels) {
        Map<String, LogLevel> ordered = new LinkedHashMap<>();
        levels.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> ordered.put(entry.getKey(), entry.getValue()));
        return Collections.unmodifiableMap(ordered);
    }
}
