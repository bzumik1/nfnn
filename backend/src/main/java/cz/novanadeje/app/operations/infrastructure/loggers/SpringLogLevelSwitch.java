package cz.novanadeje.app.operations.infrastructure.loggers;

import cz.novanadeje.app.operations.application.loggers.LogLevelSwitch;
import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LoggerName;
import org.springframework.boot.logging.LoggerConfiguration;
import org.springframework.boot.logging.LoggingSystem;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
class SpringLogLevelSwitch implements LogLevelSwitch {

    private final LoggingSystem loggingSystem;

    SpringLogLevelSwitch(LoggingSystem loggingSystem) {
        this.loggingSystem = loggingSystem;
    }

    @Override
    public Optional<LogLevel> configuredLevel(LoggerName logger) {
        LoggerConfiguration configuration = loggingSystem.getLoggerConfiguration(nameOf(logger));
        return configuration == null ? Optional.empty() : Optional.ofNullable(configuration.getConfiguredLevel()).map(SpringLogLevelSwitch::toDomain);
    }

    @Override
    public LogLevel effectiveLevel(LoggerName logger) {
        LoggerConfiguration configuration = loggingSystem.getLoggerConfiguration(nameOf(logger));
        if (configuration == null || configuration.getEffectiveLevel() == null) {
            return effectiveLevel(new LoggerName(LoggerName.ROOT));
        }
        return toDomain(configuration.getEffectiveLevel());
    }

    @Override
    public void setLevel(LoggerName logger, Optional<LogLevel> level) {
        loggingSystem.setLogLevel(nameOf(logger), level.map(SpringLogLevelSwitch::toSpring).orElse(null));
    }

    private static String nameOf(LoggerName logger) {
        return LoggerName.ROOT.equals(logger.value()) ? LoggingSystem.ROOT_LOGGER_NAME : logger.value();
    }

    private static LogLevel toDomain(org.springframework.boot.logging.LogLevel level) {
        return switch (level) {
            case TRACE -> LogLevel.TRACE;
            case DEBUG -> LogLevel.DEBUG;
            case INFO -> LogLevel.INFO;
            case WARN -> LogLevel.WARN;
            case ERROR, FATAL -> LogLevel.ERROR;
            case OFF -> LogLevel.OFF;
        };
    }

    private static org.springframework.boot.logging.LogLevel toSpring(LogLevel level) {
        return org.springframework.boot.logging.LogLevel.valueOf(level.name());
    }
}
