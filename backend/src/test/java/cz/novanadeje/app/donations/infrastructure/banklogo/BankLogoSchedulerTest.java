package cz.novanadeje.app.donations.infrastructure.banklogo;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.banklogo.BankLogoCheck;
import cz.novanadeje.app.donations.application.banklogo.BankLogoRefreshService;
import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
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
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BankLogoSchedulerTest {

    private static final Instant READY = Instant.parse("2026-11-11T04:50:00Z");
    private static final BankCode CSAS = new BankCode("0800");
    private static final BankCode KB = new BankCode("0100");
    private static final BankCode FIO = new BankCode("2010");

    private final MutableClock clock = new MutableClock(READY, ZoneOffset.UTC);
    private final BankLogoRefreshService service = mock(BankLogoRefreshService.class);
    private final TaskScheduler taskScheduler = mock(TaskScheduler.class);
    private final BankLogoScheduler scheduler = new BankLogoScheduler(service, taskScheduler, clock);
    private final Logger logger = (Logger) LoggerFactory.getLogger(BankLogoScheduler.class);
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
    @DisplayName("Given the backend is ready, when the start is announced, then one check runs on the scheduler two minutes later and refreshes what is due")
    void should_schedule_check_two_minutes_later_when_ready() {
        when(service.due()).thenReturn(List.of(CSAS));
        when(service.refresh(CSAS)).thenReturn(BankLogoCheck.FETCHED);
        ArgumentCaptor<Runnable> check = ArgumentCaptor.forClass(Runnable.class);

        scheduler.refreshSoonAfterStart();

        verify(taskScheduler).schedule(check.capture(), eq(READY.plus(Duration.ofMinutes(2))));
        check.getValue().run();
        verify(service).refresh(CSAS);
    }

    @Test
    @DisplayName("Given three due logos, when the daily check runs, then each outcome is logged with the code and the closed reason only, and a failure does not stop the others")
    void should_log_each_outcome_when_daily_check_runs_given_due_logos() {
        when(service.due()).thenReturn(List.of(CSAS, KB, FIO));
        when(service.refresh(CSAS)).thenReturn(BankLogoCheck.FETCHED);
        when(service.refresh(KB)).thenThrow(new BankLogoUnavailable(BankLogoFailure.REDIRECTED));
        when(service.refresh(FIO)).thenReturn(BankLogoCheck.UNCHANGED);

        scheduler.refresh();

        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage).containsExactly(
                tuple(Level.INFO, "Bank logo 0800 fetched"),
                tuple(Level.WARN, "Bank logo 0100 could not be fetched: redirected; keeping the stored image"),
                tuple(Level.INFO, "Bank logo 2010 unchanged"));
        assertThat(lines.list).allSatisfy(line -> assertThat(line.getThrowableProxy()).isNull());
    }

    @Test
    @DisplayName("Given a logo whose source changed while it was fetched, when the daily check runs, then nothing is logged for it")
    void should_log_nothing_when_daily_check_runs_given_skipped_logo() {
        when(service.due()).thenReturn(List.of(CSAS));
        when(service.refresh(CSAS)).thenReturn(BankLogoCheck.SKIPPED);

        scheduler.refresh();

        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given the run has used its 30 seconds, when the next due logo comes, then it waits for the next run")
    void should_stop_when_daily_check_runs_given_spent_budget() {
        when(service.due()).thenReturn(List.of(CSAS, KB));
        when(service.refresh(CSAS)).thenAnswer(invocation -> {
            clock.advance(Duration.ofSeconds(30));
            return BankLogoCheck.FETCHED;
        });

        scheduler.refresh();

        verify(service, never()).refresh(KB);
    }

    @Test
    @DisplayName("Given an unexpected failure for one logo and for the list, when the daily check runs, then only the failure's class is logged and the scheduler survives")
    void should_log_class_only_when_daily_check_runs_given_unexpected_failures() {
        when(service.due()).thenReturn(List.of(CSAS)).thenThrow(new IllegalStateException("whatever the database said"));
        when(service.refresh(CSAS)).thenThrow(new IllegalStateException("https://is1-ssl.mzstatic.com/secret"));

        scheduler.refresh();
        scheduler.refresh();

        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage).containsExactly(
                tuple(Level.ERROR, "Bank logo 0800 refresh failed unexpectedly: IllegalStateException; keeping the stored image"),
                tuple(Level.ERROR, "Bank logo refresh failed unexpectedly: IllegalStateException; keeping the stored images"));
        assertThat(lines.list).allSatisfy(line -> assertThat(line.getThrowableProxy()).isNull());
    }
}
