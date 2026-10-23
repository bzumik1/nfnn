package cz.novanadeje.app.operations.application.loggers;

import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LogLevelOverride;
import cz.novanadeje.app.operations.domain.loggers.LoggerName;
import cz.novanadeje.app.operations.domain.loggers.ProtectedLogger;
import cz.novanadeje.app.operations.domain.loggers.ProtectedLoggers;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class LogLevelService {

    static final String CHANGE_ACTION = "CHANGE_LOG_LEVEL";
    static final String RESET_ACTION = "RESET_LOG_LEVEL";
    static final List<String> WATCHED_LOGGERS = List.of(LoggerName.ROOT, "cz.novanadeje.app", "io.github.bzumik1.fio",
            "org.springframework.web", "org.springframework.security", "org.hibernate.SQL", "liquibase", "org.springframework.mail");

    private static final Logger log = LoggerFactory.getLogger(LogLevelService.class);

    private final LogLevelSwitch levels;
    private final ResetTimer timer;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final Map<String, LogLevelOverride> overrides = new ConcurrentHashMap<>();

    public LogLevelService(LogLevelSwitch levels, ResetTimer timer, ApplicationEventPublisher events, Clock clock) {
        this.levels = levels;
        this.timer = timer;
        this.events = events;
        this.clock = clock;
    }

    public LogLevelsView view() {
        Set<String> names = new LinkedHashSet<>(WATCHED_LOGGERS);
        names.addAll(overrides.keySet());
        List<LoggerView> views = new ArrayList<>();
        for (String name : names) {
            LoggerName logger = new LoggerName(name);
            views.add(new LoggerView(name, levels.configuredLevel(logger), levels.effectiveLevel(logger),
                    Optional.ofNullable(overrides.get(name))));
        }
        return new LogLevelsView(views);
    }

    @Transactional
    public LogLevelOverride override(UUID adminId, LoggerName logger, LogLevel level, int minutes) {
        if (ProtectedLoggers.covers(logger)) {
            throw new ProtectedLogger(logger);
        }
        Instant now = clock.instant();
        LogLevelOverride current = overrides.get(logger.value());
        Optional<LogLevel> configuredBefore = current == null ? levels.configuredLevel(logger) : current.configuredBefore();
        LogLevelOverride override = LogLevelOverride.forMinutes(logger, level, configuredBefore, now, minutes, adminId);
        overrides.put(logger.value(), override);
        levels.setLevel(logger, Optional.of(level));
        timer.at(override.until(), () -> expire(override));
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(),
                "The logger " + logger.value() + " was set to " + level + " until " + override.until() + " (before: "
                        + configuredBefore.map(Enum::name).orElse("inherited") + ")", now));
        log.info("Admin {} set the logger {} to {} until {}", adminId, logger.value(), level, override.until());
        return override;
    }

    @Transactional
    public boolean reset(UUID adminId, LoggerName logger) {
        LogLevelOverride removed = overrides.remove(logger.value());
        if (removed == null) {
            return false;
        }
        levels.setLevel(logger, removed.configuredBefore());
        Instant now = clock.instant();
        events.publishEvent(new AdminActionPerformed(adminId, RESET_ACTION, Optional.empty(),
                "The logger " + logger.value() + " went back to " + removed.configuredBefore().map(Enum::name).orElse("inherited")
                        + " before its override expired", now));
        log.info("Admin {} reset the logger {} to {}", adminId, logger.value(), removed.configuredBefore().map(Enum::name).orElse("inherited"));
        return true;
    }

    public void expire(LogLevelOverride override) {
        if (!overrides.remove(override.logger().value(), override)) {
            return;
        }
        levels.setLevel(override.logger(), override.configuredBefore());
        log.info("The logger {} went back to {} after its override expired", override.logger().value(),
                override.configuredBefore().map(Enum::name).orElse("inherited"));
    }
}
