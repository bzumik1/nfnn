package cz.novanadeje.app.donations.infrastructure.cnb;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.bankcode.BankCodeRefresh;
import cz.novanadeje.app.donations.application.bankcode.BankCodeRefreshService;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSourceUnavailable;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BankCodeSchedulerTest {

    private static final Instant READY = Instant.parse("2026-11-07T08:00:00Z");

    private final MutableClock clock = new MutableClock(READY, ZoneOffset.UTC);
    private final BankCodeRefreshService service = mock(BankCodeRefreshService.class);
    private final TaskScheduler taskScheduler = mock(TaskScheduler.class);
    private final BankCodeScheduler scheduler = new BankCodeScheduler(service, taskScheduler, clock);
    private final Logger logger = (Logger) LoggerFactory.getLogger(BankCodeScheduler.class);
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
        scheduler.refreshSoonAfterStart();

        verify(taskScheduler).schedule(any(Runnable.class), eq(READY.plus(Duration.ofMinutes(2))));
    }

    @Test
    @DisplayName("Given a refresh is due at the check after the start, when it runs, then the list is refreshed")
    void should_refresh_when_start_check_runs_given_due() {
        when(service.isDue()).thenReturn(true);
        when(service.refresh()).thenReturn(BankCodeRefresh.fetched(47));
        ArgumentCaptor<Runnable> check = ArgumentCaptor.forClass(Runnable.class);
        scheduler.refreshSoonAfterStart();
        verify(taskScheduler).schedule(check.capture(), any(Instant.class));

        check.getValue().run();

        verify(service).refresh();
        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage)
                .containsExactly(tuple(Level.INFO, "Bank code list fetched: 47 codes"));
    }

    @Test
    @DisplayName("Given the list was checked within 7 days, when the check after the start runs, then the source is not asked")
    void should_not_refresh_when_start_check_runs_given_not_due() {
        when(service.isDue()).thenReturn(false);
        ArgumentCaptor<Runnable> check = ArgumentCaptor.forClass(Runnable.class);
        scheduler.refreshSoonAfterStart();
        verify(taskScheduler).schedule(check.capture(), any(Instant.class));

        check.getValue().run();

        verify(service, never()).refresh();
        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given the list was checked within 7 days, when the daily check runs, then the source is not asked")
    void should_not_refresh_when_daily_check_runs_given_not_due() {
        when(service.isDue()).thenReturn(false);

        scheduler.refresh();

        verify(service, never()).refresh();
        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given a refresh is due and the source is unchanged, when the daily check runs, then it logs that the list is unchanged")
    void should_log_unchanged_when_daily_check_runs_given_due_and_unchanged_source() {
        when(service.isDue()).thenReturn(true);
        when(service.refresh()).thenReturn(BankCodeRefresh.unchanged());

        scheduler.refresh();

        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage)
                .containsExactly(tuple(Level.INFO, "Bank code list unchanged at the source"));
    }

    @Test
    @DisplayName("Given a refresh is due and the source fails, when the daily check runs, then it warns with the reason only and survives")
    void should_warn_with_reason_when_daily_check_runs_given_failing_source() {
        when(service.isDue()).thenReturn(true);
        when(service.refresh()).thenThrow(new BankCodeSourceUnavailable("refused list"));

        scheduler.refresh();

        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage)
                .containsExactly(tuple(Level.WARN, "Bank code list could not be fetched: refused list; keeping the stored list until the next run"));
        assertThat(lines.list.getFirst().getThrowableProxy()).isNull();
    }

    @Test
    @DisplayName("Given a refresh is due and it fails unexpectedly, when the daily check runs, then it logs the failure's class only and survives")
    void should_log_class_only_when_daily_check_runs_given_unexpected_failure() {
        when(service.isDue()).thenReturn(true);
        when(service.refresh()).thenThrow(new IllegalStateException("whatever the database said"));

        scheduler.refresh();

        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage)
                .containsExactly(tuple(Level.ERROR, "Bank code list refresh failed unexpectedly: IllegalStateException; keeping the stored list until the next run"));
        assertThat(lines.list.getFirst().getThrowableProxy()).isNull();
    }
}
