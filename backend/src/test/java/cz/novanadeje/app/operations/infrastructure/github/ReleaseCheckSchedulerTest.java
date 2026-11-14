package cz.novanadeje.app.operations.infrastructure.github;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.release.ReleaseCheckOutcome;
import cz.novanadeje.app.operations.application.release.ReleaseCheckService;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseCheckFailure;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.TaskScheduler;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReleaseCheckSchedulerTest {

    private static final Instant READY = Instant.parse("2026-11-14T08:00:00Z");

    private final MutableClock clock = new MutableClock(READY, ZoneOffset.UTC);
    private final ReleaseCheckService service = mock(ReleaseCheckService.class);
    private final TaskScheduler taskScheduler = mock(TaskScheduler.class);
    private final ReleaseCheckScheduler scheduler = new ReleaseCheckScheduler(service, taskScheduler, clock);
    private final Logger logger = (Logger) LoggerFactory.getLogger(ReleaseCheckScheduler.class);
    private final ListAppender<ILoggingEvent> lines = new ListAppender<>();

    @BeforeEach
    void captureLog() {
        lines.start();
        logger.addAppender(lines);
    }

    @AfterEach
    void releaseLog() {
        logger.detachAppender(lines);
    }

    @Test
    @DisplayName("Given the backend is ready, when the start is announced, then one check runs on the scheduler two minutes later")
    void should_schedule_check_two_minutes_later_when_ready() {
        when(service.check()).thenReturn(new ReleaseCheckOutcome.Found(Release.parse("2026.11.5").orElseThrow()));
        ArgumentCaptor<Runnable> check = ArgumentCaptor.forClass(Runnable.class);

        scheduler.checkSoonAfterStart();

        verify(taskScheduler).schedule(check.capture(), eq(READY.plus(Duration.ofMinutes(2))));
        check.getValue().run();
        verify(service).check();
    }

    @Test
    @DisplayName("Given the source names a release, when the daily check runs, then it logs the release")
    void should_log_release_when_daily_check_runs_given_found() {
        when(service.check()).thenReturn(new ReleaseCheckOutcome.Found(Release.parse("2026.11.5").orElseThrow()));

        scheduler.check();

        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage)
                .containsExactly(tuple(Level.INFO, "Release check: the latest release is 2026.11.5"));
    }


    @Test
    @DisplayName("Given the source fails, when the daily check runs, then it warns with the reason only")
    void should_warn_with_reason_when_daily_check_runs_given_failure() {
        when(service.check()).thenReturn(new ReleaseCheckOutcome.Failed(ReleaseCheckFailure.STATUS, "status 403"));

        scheduler.check();

        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage)
                .containsExactly(tuple(Level.WARN, "Release check failed: status 403; keeping the last known release until the next run"));
    }

    @Test
    @DisplayName("Given the check fails unexpectedly, when the daily check runs, then it logs the failure's class only and survives")
    void should_log_class_only_when_daily_check_runs_given_unexpected_failure() {
        when(service.check()).thenThrow(new IllegalStateException("whatever GitHub said"));

        scheduler.check();

        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage)
                .containsExactly(tuple(Level.ERROR, "Release check failed unexpectedly: IllegalStateException; keeping the last known release until the next run"));
        assertThat(lines.list.getFirst().getThrowableProxy()).isNull();
    }
}
