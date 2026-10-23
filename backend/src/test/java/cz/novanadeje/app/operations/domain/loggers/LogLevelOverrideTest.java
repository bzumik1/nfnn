package cz.novanadeje.app.operations.domain.loggers;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LogLevelOverrideTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final UUID ADMIN = UUID.randomUUID();
    private static final LoggerName LOGGER = new LoggerName("cz.novanadeje.app");

    @Test
    @DisplayName("Given 30 minutes, when an override is made, then it ends 30 minutes later and expires only then")
    void should_end_after_the_minutes_when_made_given_a_span() {
        LogLevelOverride override = LogLevelOverride.forMinutes(LOGGER, LogLevel.DEBUG, Optional.of(LogLevel.INFO), NOW, 30, ADMIN);

        assertThat(override.until()).isEqualTo(NOW.plus(Duration.ofMinutes(30)));
        assertThat(override.expiredAt(NOW.plus(Duration.ofMinutes(29)))).isFalse();
        assertThat(override.expiredAt(NOW.plus(Duration.ofMinutes(30)))).isTrue();
        assertThat(override.configuredBefore()).contains(LogLevel.INFO);
    }

    @Test
    @DisplayName("Given 0 minutes or more than a day, when an override is made, then it is refused")
    void should_refuse_override_when_made_given_span_outside_limits() {
        assertThatThrownBy(() -> LogLevelOverride.forMinutes(LOGGER, LogLevel.DEBUG, Optional.empty(), NOW, 0, ADMIN))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> LogLevelOverride.forMinutes(LOGGER, LogLevel.DEBUG, Optional.empty(), NOW, LogLevelOverride.MAX_MINUTES + 1, ADMIN))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
