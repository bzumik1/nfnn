package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.loggers.LogLevelsView;
import cz.novanadeje.app.operations.application.loggers.LoggerView;
import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LogLevelOverride;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record LogLevelsResponse(List<Item> loggers) {

    static LogLevelsResponse from(LogLevelsView view) {
        return new LogLevelsResponse(view.loggers().stream().map(Item::from).toList());
    }

    record Item(String logger, LogLevel configuredLevel, LogLevel effectiveLevel, Override override) {

        static Item from(LoggerView view) {
            return new Item(view.logger(), view.configuredLevel().orElse(null), view.effectiveLevel(),
                    view.override().map(Override::from).orElse(null));
        }
    }

    record Override(String logger, LogLevel level, LogLevel configuredBefore, Instant since, Instant until, UUID adminId) {

        static Override from(LogLevelOverride override) {
            return new Override(override.logger().value(), override.level(), override.configuredBefore().orElse(null), override.since(),
                    override.until(), override.adminId());
        }
    }
}
