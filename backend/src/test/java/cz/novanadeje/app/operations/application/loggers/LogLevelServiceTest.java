package cz.novanadeje.app.operations.application.loggers;

import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LogLevelOverride;
import cz.novanadeje.app.operations.domain.loggers.LoggerName;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LogLevelServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final UUID ADMIN = UUID.randomUUID();
    private static final LoggerName APP = new LoggerName("cz.novanadeje.app");

    @Mock
    private LogLevelSwitch levels;
    @Mock
    private ResetTimer timer;
    @Mock
    private ApplicationEventPublisher events;

    private LogLevelService service;

    @BeforeEach
    void setUp() {
        service = new LogLevelService(levels, timer, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a logger at INFO, when an administrator raises it to DEBUG for 10 minutes, then the level switches, the reset is timed and the change is audited")
    void should_switch_time_and_audit_when_raised_given_configured_level() {
        when(levels.configuredLevel(APP)).thenReturn(Optional.of(LogLevel.INFO));

        LogLevelOverride override = service.override(ADMIN, APP, LogLevel.DEBUG, 10);

        assertThat(override.until()).isEqualTo(NOW.plus(Duration.ofMinutes(10)));
        assertThat(override.configuredBefore()).contains(LogLevel.INFO);
        verify(levels).setLevel(APP, Optional.of(LogLevel.DEBUG));
        verify(timer).at(eq(NOW.plus(Duration.ofMinutes(10))), any(Runnable.class));
        ArgumentCaptor<AdminActionPerformed> action = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(action.capture());
        assertThat(action.getValue().action()).isEqualTo("CHANGE_LOG_LEVEL");
        assertThat(action.getValue().details()).contains("cz.novanadeje.app was set to DEBUG").contains("before: INFO");
        assertThat(service.view().loggers()).anySatisfy(logger -> {
            assertThat(logger.logger()).isEqualTo("cz.novanadeje.app");
            assertThat(logger.override()).contains(override);
        });
    }

    @Test
    @DisplayName("Given an override, when its time comes, then the logger goes back to what was configured before and nothing is audited")
    void should_restore_when_expired_given_override() {
        when(levels.configuredLevel(APP)).thenReturn(Optional.empty());
        LogLevelOverride override = service.override(ADMIN, APP, LogLevel.TRACE, 5);
        ArgumentCaptor<Runnable> reset = ArgumentCaptor.forClass(Runnable.class);
        verify(timer).at(any(), reset.capture());

        reset.getValue().run();

        verify(levels).setLevel(APP, Optional.empty());
        assertThat(service.view().loggers()).noneMatch(logger -> logger.override().isPresent());
        assertThat(override.expiredAt(NOW.plus(Duration.ofMinutes(5)))).isTrue();
    }

    @Test
    @DisplayName("Given an override replaced by a second one, when the first one's time comes, then the second stays and the original level is still remembered")
    void should_keep_second_override_when_first_expires_given_replacement() {
        when(levels.configuredLevel(APP)).thenReturn(Optional.of(LogLevel.INFO));
        service.override(ADMIN, APP, LogLevel.DEBUG, 5);
        ArgumentCaptor<Runnable> firstReset = ArgumentCaptor.forClass(Runnable.class);
        verify(timer).at(eq(NOW.plus(Duration.ofMinutes(5))), firstReset.capture());

        LogLevelOverride second = service.override(ADMIN, APP, LogLevel.TRACE, 20);
        firstReset.getValue().run();

        assertThat(second.configuredBefore()).contains(LogLevel.INFO);
        verify(levels, never()).setLevel(APP, Optional.of(LogLevel.INFO));
        assertThat(service.view().loggers()).anySatisfy(logger -> assertThat(logger.override()).contains(second));
    }

    @Test
    @DisplayName("Given an override, when an administrator resets it, then the level goes back at once and the reset is audited; without one nothing happens")
    void should_restore_and_audit_when_reset_given_override() {
        when(levels.configuredLevel(APP)).thenReturn(Optional.of(LogLevel.WARN));
        service.override(ADMIN, APP, LogLevel.DEBUG, 5);

        assertThat(service.reset(ADMIN, APP)).isTrue();
        assertThat(service.reset(ADMIN, APP)).isFalse();

        verify(levels).setLevel(APP, Optional.of(LogLevel.WARN));
        ArgumentCaptor<AdminActionPerformed> actions = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events, org.mockito.Mockito.times(2)).publishEvent(actions.capture());
        assertThat(actions.getAllValues().getLast().action()).isEqualTo("RESET_LOG_LEVEL");
    }
}
