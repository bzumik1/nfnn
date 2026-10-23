package cz.novanadeje.app.operations.application.loggers;

import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LoggerName;

import java.util.Optional;

public interface LogLevelSwitch {

    Optional<LogLevel> configuredLevel(LoggerName logger);

    LogLevel effectiveLevel(LoggerName logger);

    void setLevel(LoggerName logger, Optional<LogLevel> level);
}
