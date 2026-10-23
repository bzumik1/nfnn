package cz.novanadeje.app.operations.application.loggers;

import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LogLevelOverride;

import java.util.Optional;

public record LoggerView(String logger, Optional<LogLevel> configuredLevel, LogLevel effectiveLevel, Optional<LogLevelOverride> override) {
}
