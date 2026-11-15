package cz.novanadeje.app.shared.infrastructure.persistence;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.database.migration")
public record MigrationSessionProperties(Duration lockTimeout) {

    public MigrationSessionProperties {
        if (lockTimeout == null || lockTimeout.isNegative() || lockTimeout.isZero()) {
            throw new IllegalArgumentException("app.database.migration.lock-timeout must be a positive duration");
        }
    }

    String sessionOptions() {
        return "-c lock_timeout=" + lockTimeout.toMillis() + "ms -c statement_timeout=0";
    }
}
