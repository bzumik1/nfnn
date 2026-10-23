package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LogLevelOverride;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

record LogLevelRequest(@NotNull LogLevel level, @Min(1) @Max(LogLevelOverride.MAX_MINUTES) Integer minutes) {
}
