package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.loggers.LogLevelService;
import cz.novanadeje.app.operations.domain.loggers.InvalidLoggerName;
import cz.novanadeje.app.operations.domain.loggers.LogLevelOverride;
import cz.novanadeje.app.operations.domain.loggers.LogOverrideNotFound;
import cz.novanadeje.app.operations.domain.loggers.LoggerName;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@Validated
@RequestMapping("/api/admin/operations/loggers")
class AdminLoggersController {

    private final LogLevelService levels;

    AdminLoggersController(LogLevelService levels) {
        this.levels = levels;
    }

    @GetMapping
    LogLevelsResponse loggers() {
        return LogLevelsResponse.from(levels.view());
    }

    @PutMapping("/{logger}")
    LogLevelsResponse.Override override(@AuthenticationPrincipal Jwt jwt, @PathVariable @Size(max = LoggerName.MAX_LENGTH) String logger,
                                        @Valid @RequestBody LogLevelRequest request) {
        LogLevelOverride override = levels.override(admin(jwt), loggerNamed(logger), request.level(),
                request.minutes() == null ? LogLevelOverride.DEFAULT_MINUTES : request.minutes());
        return LogLevelsResponse.Override.from(override);
    }

    @DeleteMapping("/{logger}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reset(@AuthenticationPrincipal Jwt jwt, @PathVariable @Size(max = LoggerName.MAX_LENGTH) String logger) {
        if (!levels.reset(admin(jwt), loggerNamed(logger))) {
            throw new LogOverrideNotFound();
        }
    }

    private static LoggerName loggerNamed(String logger) {
        if (!LoggerName.isValid(logger)) {
            throw new InvalidLoggerName();
        }
        return new LoggerName(logger);
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
