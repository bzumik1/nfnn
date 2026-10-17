package cz.novanadeje.app.donations.infrastructure.fio;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.FollowUp;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import cz.novanadeje.app.donations.application.importing.ImportCounts;
import cz.novanadeje.app.donations.application.importing.ImportReport;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.TaskScheduler;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ScheduledFuture;

import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.HOURLY;
import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.STARTUP;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FioImportSchedulerTest {

    private static final Instant RETRY_AT = Instant.parse("2026-10-17T10:00:31Z");
    private static final ImportPeriod REQUESTED = new ImportPeriod(LocalDate.parse("2026-07-20"), LocalDate.parse("2026-10-17"));
    private static final BankImportProperties IMPORT_PROPERTIES = new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "2025-01-01");
    private static final ImportSettings SETTINGS = IMPORT_PROPERTIES.toSettings();

    private final ImportBankPaymentsService service = mock(ImportBankPaymentsService.class);
    private final TaskScheduler taskScheduler = mock(TaskScheduler.class);
    private final FioImportScheduler scheduler = new FioImportScheduler(service, IMPORT_PROPERTIES, taskScheduler);
    private ListAppender<ILoggingEvent> log;

    @BeforeEach
    void captureLog() {
        log = new ListAppender<>();
        log.start();
        logger().addAppender(log);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(log);
    }

    @Test
    @DisplayName("Given a fresh scheduler, when it ticks twice, then the first run is the startup import and the second the hourly one")
    void should_run_startup_then_hourly_when_ticked_given_fresh_scheduler() {
        when(service.importIncomingPayments(any(), any())).thenReturn(completed(STARTUP), completed(HOURLY));

        scheduler.tick();
        scheduler.tick();

        verify(service).importIncomingPayments(STARTUP, SETTINGS);
        verify(service).importIncomingPayments(HOURLY, SETTINGS);
    }

    @Test
    @DisplayName("Given a completed import, when the scheduler ticks, then no follow-up is scheduled and nothing is logged on top of the service's completion line")
    void should_schedule_nothing_when_ticked_given_completed_import() {
        when(service.importIncomingPayments(any(), any())).thenReturn(completed(STARTUP));

        scheduler.tick();

        verify(taskScheduler, never()).schedule(any(Runnable.class), any(Instant.class));
        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given an import that reports a follow-up, when the scheduler ticks, then the follow-up runs at the reported instant with its trigger")
    void should_schedule_follow_up_at_reported_instant_when_ticked_given_follow_up() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP)))
                .thenReturn(completed(STARTUP));
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        scheduler.tick();
        Runnable followUp = scheduledFollowUp();
        followUp.run();

        verify(taskScheduler).schedule(any(Runnable.class), eq(RETRY_AT));
        verify(service, times(2)).importIncomingPayments(STARTUP, SETTINGS);
    }

    @Test
    @DisplayName("Given a pending follow-up, when the follow-up asks for another one, then the first is cancelled and only the second stays pending")
    void should_cancel_previous_follow_up_when_scheduling_given_pending_follow_up() {
        ScheduledFuture<?> first = mock(ScheduledFuture.class);
        ScheduledFuture<?> second = mock(ScheduledFuture.class);
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.HISTORY_LOCKED, new FollowUp(RETRY_AT, HOURLY)))
                .thenReturn(failed(HOURLY, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT.plusSeconds(31), HOURLY)));
        doReturn(first).doReturn(second).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        scheduler.tick();
        scheduledFollowUp().run();

        verify(first).cancel(false);
        verify(second, never()).cancel(any(Boolean.class));
        verify(service).importIncomingPayments(HOURLY, SETTINGS);
    }

    @Test
    @DisplayName("Given three follow-ups since the tick, when a fourth is reported, then it is not scheduled and a warning says the scheduler waits for the hourly run")
    void should_refuse_fourth_follow_up_when_reported_given_three_since_tick() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP)));
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        scheduler.tick();
        for (int i = 0; i < 3; i++) {
            scheduledFollowUps().getLast().run();
        }

        verify(taskScheduler, times(3)).schedule(any(Runnable.class), any(Instant.class));
        verify(service, times(4)).importIncomingPayments(STARTUP, SETTINGS);
        assertThat(messages(Level.WARN))
                .contains("Fio refused 4 follow-ups in a row; waiting for the next hourly run");
    }

    @Test
    @DisplayName("Given a pending follow-up and an exhausted follow-up budget, when the scheduler ticks, then the pending follow-up is cancelled and three new follow-ups are allowed again")
    void should_cancel_pending_follow_up_and_reset_budget_when_ticked_given_pending_follow_up() {
        ScheduledFuture<?> pending = mock(ScheduledFuture.class);
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP)));
        doReturn(mock(ScheduledFuture.class)).doReturn(mock(ScheduledFuture.class)).doReturn(pending)
                .doReturn(mock(ScheduledFuture.class))
                .when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        scheduler.tick();
        for (int i = 0; i < 3; i++) {
            scheduledFollowUps().getLast().run();
        }

        scheduler.tick();

        verify(pending).cancel(false);
        verify(taskScheduler, times(4)).schedule(any(Runnable.class), any(Instant.class));
        assertThat(messages(Level.WARN)).filteredOn(message -> message.startsWith("Fio refused")).hasSize(1);
    }

    @Test
    @DisplayName("Given an import still running, when another run starts, then it is skipped with a warning and the service is called once")
    void should_skip_run_when_started_given_import_still_running() {
        when(service.importIncomingPayments(any(), any())).thenAnswer(invocation -> {
            scheduler.run(HOURLY);
            return completed(STARTUP);
        });

        scheduler.tick();

        verify(service, times(1)).importIncomingPayments(any(), any());
        assertThat(messages(Level.WARN)).contains("Fio import HOURLY skipped, previous import still running");
    }

    @Test
    @DisplayName("Given an import that throws, when the scheduler ticks, then nothing escapes, the error is logged once and the next tick runs again")
    void should_log_and_continue_when_ticked_given_import_throws() {
        when(service.importIncomingPayments(any(), any()))
                .thenThrow(new IllegalStateException("database is down"))
                .thenReturn(completed(HOURLY));

        assertThatCode(scheduler::tick).doesNotThrowAnyException();
        scheduler.tick();

        assertThat(log.list).filteredOn(event -> event.getLevel() == Level.ERROR).singleElement()
                .satisfies(event -> {
                    assertThat(event.getFormattedMessage()).isEqualTo("Fio import STARTUP failed unexpectedly");
                    assertThat(event.getThrowableProxy().getMessage()).isEqualTo("database is down");
                });
        verify(service).importIncomingPayments(HOURLY, SETTINGS);
    }

    @Test
    @DisplayName("Given a follow-up whose import throws, when it runs, then nothing escapes the scheduler thread")
    void should_not_throw_when_follow_up_runs_given_import_throws() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP)))
                .thenThrow(new IllegalStateException("boom"));
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        scheduler.tick();

        assertThatCode(() -> scheduledFollowUp().run()).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given the bank's 30-second limit, when the import fails, then a warning names the follow-up")
    void should_warn_with_follow_up_when_ticked_given_rate_limited() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP)));
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        scheduler.tick();

        assertThat(messages(Level.WARN)).containsExactly(
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with RATE_LIMITED; follow-up STARTUP at 2026-10-17T10:00:31Z");
        assertThat(messages(Level.ERROR)).isEmpty();
    }

    @Test
    @DisplayName("Given a transport failure, when the import fails, then a warning says the next hourly run retries")
    void should_warn_when_ticked_given_transport_failure() {
        when(service.importIncomingPayments(any(), any())).thenReturn(failed(STARTUP, ImportFailureKind.TRANSPORT, null));

        scheduler.tick();

        assertThat(messages(Level.WARN)).containsExactly(
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with TRANSPORT; retrying at the next hourly run");
        assertThat(messages(Level.ERROR)).isEmpty();
    }

    @Test
    @DisplayName("Given locked history on a deep request, when the import fails, then a warning tells the operator how to unlock it")
    void should_warn_with_unlock_instruction_when_ticked_given_history_locked() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.HISTORY_LOCKED, new FollowUp(RETRY_AT, HOURLY)));
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        scheduler.tick();

        assertThat(messages(Level.WARN)).containsExactly(
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with HISTORY_LOCKED: unlock the history in Fio internet banking "
                        + "(Nastavení > API, the lock icon) and restart the backend within 10 minutes, or shorten FIO_HISTORY_FROM; "
                        + "follow-up HOURLY at 2026-10-17T10:00:31Z");
    }

    @Test
    @DisplayName("Given locked history on a request inside the window, when the import fails, then the scheduler adds no unlock instruction to the service's error")
    void should_not_advise_unlock_when_ticked_given_history_locked_inside_window() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(HOURLY, ImportFailureKind.HISTORY_LOCKED, null, false));

        scheduler.tick();

        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given a rejected token, when the import fails, then an error tells the operator to renew the token")
    void should_log_error_with_renewal_instruction_when_ticked_given_unauthorized() {
        when(service.importIncomingPayments(any(), any())).thenReturn(failed(STARTUP, ImportFailureKind.UNAUTHORIZED, null));

        scheduler.tick();

        assertThat(messages(Level.ERROR)).containsExactly(
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with UNAUTHORIZED: the Fio token is missing, not yet active or "
                        + "expired (180 days): create a new one in Fio internet banking and set FIO_TOKEN; retrying at the next hourly run");
        assertThat(messages(Level.WARN)).isEmpty();
    }

    @Test
    @DisplayName("Given an invalid response or an unexpected failure, when the import fails, then an error is logged")
    void should_log_error_when_ticked_given_invalid_response_or_unexpected_failure() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.INVALID_RESPONSE, null))
                .thenReturn(failed(HOURLY, ImportFailureKind.UNEXPECTED, null));

        scheduler.tick();
        scheduler.tick();

        assertThat(messages(Level.ERROR)).containsExactly(
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with INVALID_RESPONSE; retrying at the next hourly run",
                "Fio import HOURLY 2026-07-20/2026-10-17 failed with UNEXPECTED; retrying at the next hourly run");
        assertThat(messages(Level.WARN)).isEmpty();
    }

    private Runnable scheduledFollowUp() {
        return scheduledFollowUps().getLast();
    }

    private List<Runnable> scheduledFollowUps() {
        ArgumentCaptor<Runnable> tasks = ArgumentCaptor.forClass(Runnable.class);
        verify(taskScheduler, atLeastOnce()).schedule(tasks.capture(), any(Instant.class));
        return tasks.getAllValues();
    }

    private List<String> messages(Level level) {
        return log.list.stream().filter(event -> event.getLevel() == level).map(ILoggingEvent::getFormattedMessage).toList();
    }

    private static ImportReport completed(ImportTrigger trigger) {
        return new ImportReport(trigger, REQUESTED, false, Optional.of(REQUESTED), new ImportCoverage(REQUESTED.from(), REQUESTED.to()),
                ImportCounts.none(), Optional.empty(), Optional.empty());
    }

    private static ImportReport failed(ImportTrigger trigger, ImportFailureKind kind, FollowUp followUp) {
        return failed(trigger, kind, followUp, true);
    }

    private static ImportReport failed(ImportTrigger trigger, ImportFailureKind kind, FollowUp followUp, boolean needsUnlockedHistory) {
        return new ImportReport(trigger, REQUESTED, needsUnlockedHistory, Optional.empty(), ImportCoverage.none(), ImportCounts.none(),
                Optional.of(kind), Optional.ofNullable(followUp));
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(FioImportScheduler.class);
    }
}
