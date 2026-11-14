package cz.novanadeje.app.donations.infrastructure.fio;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.FollowUp;
import cz.novanadeje.app.donations.application.importing.HistoryImportRun;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import cz.novanadeje.app.donations.application.importing.ImportCounts;
import cz.novanadeje.app.donations.application.importing.ImportFollowUps;
import cz.novanadeje.app.donations.application.importing.ImportReport;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import cz.novanadeje.app.donations.infrastructure.events.DonationLiveFeeds;
import cz.novanadeje.app.shared.application.event.StoredDataChanged;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.slf4j.LoggerFactory;
import cz.novanadeje.app.support.MutableClock;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.TaskScheduler;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ScheduledFuture;

import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.HISTORY;
import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.HOURLY;
import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.ON_DEMAND;
import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.STARTUP;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FioImportSchedulerTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final Instant RETRY_AT = Instant.parse("2026-10-17T10:00:31Z");
    private static final Instant PUT_OFF_UNTIL = Instant.parse("2026-10-17T10:00:45Z");
    private static final ImportPeriod REQUESTED = new ImportPeriod(LocalDate.parse("2026-07-20"), LocalDate.parse("2026-10-17"));
    private static final String FAILURE_MESSAGE = "Fio API request GET /periods/***/ failed: timed out";
    private static final Duration COOLDOWN = Duration.ofSeconds(30);
    private static final BankImportProperties IMPORT_PROPERTIES = new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "2025-01-01", COOLDOWN);
    private static final ImportSettings SETTINGS = IMPORT_PROPERTIES.toSettings();
    private static final LocalDate HISTORY_FROM = LocalDate.parse("2026-01-01");
    private static final ImportPeriod HISTORY_PERIOD = new ImportPeriod(HISTORY_FROM, LocalDate.parse("2026-10-17"));
    private static final Instant STARTS_AT = NOW.plusSeconds(20);

    private final ImportBankPaymentsService service = mock(ImportBankPaymentsService.class);
    private final TaskScheduler taskScheduler = mock(TaskScheduler.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private final ImportFollowUps followUps = mock(ImportFollowUps.class);
    private final FioImportScheduler scheduler = new FioImportScheduler(service, IMPORT_PROPERTIES, taskScheduler, followUps, clock, events);
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
    @DisplayName("Given a pending follow-up, when the scheduler ticks, then the pending follow-up is cancelled and the follow-ups start counting again before the import runs")
    void should_cancel_pending_follow_up_and_restart_count_before_import_when_ticked_given_pending_follow_up() {
        ScheduledFuture<?> pending = mock(ScheduledFuture.class);
        doReturn(pending).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP)))
                .thenReturn(completed(HOURLY));
        when(followUps.after(any())).thenReturn(Optional.of(new FollowUp(RETRY_AT, STARTUP)), Optional.empty());
        scheduler.tick();

        scheduler.tick();

        verify(pending).cancel(false);
        InOrder order = inOrder(followUps, service);
        order.verify(followUps).scheduledRunStarted();
        order.verify(service).importIncomingPayments(STARTUP, SETTINGS);
        order.verify(followUps).scheduledRunStarted();
        order.verify(service).importIncomingPayments(HOURLY, SETTINGS);
    }

    @Test
    @DisplayName("Given an import the bank held back, when its follow-up runs, then the follow-ups keep counting, because only the scheduled run starts the count again")
    void should_keep_counting_follow_ups_when_the_follow_up_runs_given_an_import_held_back() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP)))
                .thenReturn(completed(STARTUP));
        when(followUps.after(any())).thenReturn(Optional.of(new FollowUp(RETRY_AT, STARTUP)), Optional.empty());
        scheduler.tick();

        scheduledFollowUp().run();

        verify(service, times(2)).importIncomingPayments(STARTUP, SETTINGS);
        verify(followUps, times(1)).scheduledRunStarted();
    }

    @Test
    @DisplayName("Given an on-demand import, when it runs, then the follow-ups do not start counting again, because only the scheduled run starts the count")
    void should_not_restart_the_follow_up_count_when_an_on_demand_import_runs_given_requested_import() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importOnDemand(any(), any())).thenReturn(Optional.of(completed(ON_DEMAND)));
        scheduler.requestImport();

        scheduledFollowUp().run();

        verify(service).importOnDemand(SETTINGS, COOLDOWN);
        verify(followUps, never()).scheduledRunStarted();
    }

    @Test
    @DisplayName("Given an on-demand import, when it ends, then the bank import hint goes out once the scheduler no longer reports an import in progress")
    void should_publish_bank_import_hint_after_progress_cleared_when_on_demand_import_ends_given_requested_import() {
        when(service.importOnDemand(any(), any())).thenReturn(Optional.of(completed(ON_DEMAND)));
        List<Boolean> inProgressAtHint = new ArrayList<>();
        doAnswer(invocation -> inProgressAtHint.add(scheduler.inProgress())).when(events).publishEvent(any(Object.class));
        scheduler.requestImport();

        scheduledFollowUp().run();

        verify(events).publishEvent(StoredDataChanged.of(DonationLiveFeeds.BANK_IMPORT));
        assertThat(inProgressAtHint).containsExactly(false);
    }

    @Test
    @DisplayName("Given a queued run of older payments, when it ends, then the bank import hint goes out once the scheduler no longer reports an import in progress")
    void should_publish_bank_import_hint_after_progress_cleared_when_history_run_ends_given_queued_run() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importHistory(any(), any())).thenReturn(history(null, null));
        allRunsDue();
        List<Boolean> inProgressAtHint = new ArrayList<>();
        doAnswer(invocation -> inProgressAtHint.add(scheduler.inProgress())).when(events).publishEvent(any(Object.class));
        scheduler.requestHistoryImport(run(1, HISTORY_FROM, NOW));

        scheduledFollowUp().run();

        verify(events).publishEvent(StoredDataChanged.of(DonationLiveFeeds.BANK_IMPORT));
        assertThat(inProgressAtHint).containsExactly(false);
    }

    @Test
    @DisplayName("Given an hourly import that fails unexpectedly, when the scheduler ticks, then the bank import hint still goes out")
    void should_publish_bank_import_hint_when_ticked_given_unexpected_failure() {
        when(service.importIncomingPayments(any(), any())).thenThrow(new IllegalStateException("boom"));

        scheduler.tick();

        verify(events).publishEvent(StoredDataChanged.of(DonationLiveFeeds.BANK_IMPORT));
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
        ImportReport heldBack = failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP));
        when(service.importIncomingPayments(any(), any())).thenReturn(heldBack).thenReturn(completed(STARTUP));
        when(followUps.after(heldBack)).thenReturn(Optional.of(new FollowUp(RETRY_AT, STARTUP)));
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        scheduler.tick();
        Runnable followUp = scheduledFollowUp();
        followUp.run();

        verify(taskScheduler).schedule(any(Runnable.class), eq(RETRY_AT));
        verify(service, times(2)).importIncomingPayments(STARTUP, SETTINGS);
    }

    @Test
    @DisplayName("Given an import the bank held back, when the follow-ups allow no more, then nothing is scheduled")
    void should_schedule_nothing_when_follow_ups_allow_no_more_given_import_held_back() {
        ImportReport heldBack = failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP));
        when(service.importIncomingPayments(any(), any())).thenReturn(heldBack);
        when(followUps.after(heldBack)).thenReturn(Optional.empty());

        scheduler.tick();

        verify(followUps).after(heldBack);
        verify(taskScheduler, never()).schedule(any(Runnable.class), any(Instant.class));
    }

    @Test
    @DisplayName("Given a pending follow-up, when the follow-up asks for another one, then the first is cancelled and only the second stays pending")
    void should_cancel_previous_follow_up_when_scheduling_given_pending_follow_up() {
        ScheduledFuture<?> first = mock(ScheduledFuture.class);
        ScheduledFuture<?> second = mock(ScheduledFuture.class);
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.HISTORY_LOCKED, new FollowUp(RETRY_AT, HOURLY)))
                .thenReturn(failed(HOURLY, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT.plusSeconds(31), HOURLY)));
        when(followUps.after(any()))
                .thenReturn(Optional.of(new FollowUp(RETRY_AT, HOURLY)))
                .thenReturn(Optional.of(new FollowUp(RETRY_AT.plusSeconds(31), HOURLY)));
        doReturn(first).doReturn(second).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        scheduler.tick();
        scheduledFollowUp().run();

        verify(first).cancel(false);
        verify(second, never()).cancel(any(Boolean.class));
        verify(service).importIncomingPayments(HOURLY, SETTINGS);
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
                .thenThrow(new IllegalStateException("payment from 2000145399/0800 could not be stored"))
                .thenReturn(completed(HOURLY));

        assertThatCode(scheduler::tick).doesNotThrowAnyException();
        scheduler.tick();

        assertThat(log.list).filteredOn(event -> event.getLevel() == Level.ERROR).singleElement()
                .satisfies(event -> {
                    assertThat(event.getFormattedMessage()).isEqualTo("Fio import STARTUP failed unexpectedly: java.lang.IllegalStateException");
                    assertThat(event.getThrowableProxy()).isNull();
                });
        verify(service).importIncomingPayments(HOURLY, SETTINGS);
    }

    @Test
    @DisplayName("Given a follow-up whose import throws, when it runs, then nothing escapes the scheduler thread")
    void should_not_throw_when_follow_up_runs_given_import_throws() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP)))
                .thenThrow(new IllegalStateException("boom"));
        when(followUps.after(any())).thenReturn(Optional.of(new FollowUp(RETRY_AT, STARTUP)));
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        scheduler.tick();

        assertThatCode(() -> scheduledFollowUp().run()).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given the bank's 30-second limit, when the import fails, then a warning names the follow-up")
    void should_warn_with_follow_up_when_ticked_given_rate_limited() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, STARTUP)));

        scheduler.tick();

        assertThat(messages(Level.WARN)).containsExactly(
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with RATE_LIMITED (" + FAILURE_MESSAGE + "); follow-up STARTUP at 2026-10-17T10:00:31Z");
        assertThat(messages(Level.ERROR)).isEmpty();
    }

    @Test
    @DisplayName("Given a transport failure, when the import fails, then a warning carries the masked failure message and says the next hourly run retries")
    void should_warn_when_ticked_given_transport_failure() {
        when(service.importIncomingPayments(any(), any())).thenReturn(failed(STARTUP, ImportFailureKind.TRANSPORT, null));

        scheduler.tick();

        assertThat(messages(Level.WARN)).containsExactly(
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with TRANSPORT (" + FAILURE_MESSAGE + "); retrying at the next hourly run");
        assertThat(messages(Level.ERROR)).isEmpty();
    }

    @Test
    @DisplayName("Given locked history on a deep request, when the import fails, then a warning tells the operator how to unlock it")
    void should_warn_with_unlock_instruction_when_ticked_given_history_locked() {
        when(service.importIncomingPayments(any(), any()))
                .thenReturn(failed(STARTUP, ImportFailureKind.HISTORY_LOCKED, new FollowUp(RETRY_AT, HOURLY)));

        scheduler.tick();

        assertThat(messages(Level.WARN)).containsExactly(
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with HISTORY_LOCKED (" + FAILURE_MESSAGE + "): unlock the history in Fio internet banking "
                        + "(Nastavení > API, the lock icon) and press Načíst starší platby on /sprava within 10 minutes; "
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
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with UNAUTHORIZED (" + FAILURE_MESSAGE + "): the Fio token is missing, not yet active or "
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
                "Fio import STARTUP 2026-07-20/2026-10-17 failed with INVALID_RESPONSE (" + FAILURE_MESSAGE + "); retrying at the next hourly run",
                "Fio import HOURLY 2026-07-20/2026-10-17 failed with UNEXPECTED (" + FAILURE_MESSAGE + "); retrying at the next hourly run");
        assertThat(messages(Level.WARN)).isEmpty();
    }

    @Test
    @DisplayName("Given nothing pending, when an import is requested twice, then one on-demand run is scheduled now and the scheduler reports work in progress")
    void should_schedule_one_on_demand_run_now_when_requested_twice_given_nothing_pending() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        scheduler.requestImport();
        scheduler.requestImport();

        verify(taskScheduler, times(1)).schedule(any(Runnable.class), eq(NOW));
        assertThat(scheduler.inProgress()).isTrue();
        verify(service, never()).importOnDemand(any(), any());
    }

    @Test
    @DisplayName("Given the task scheduler refuses the run, when an import is requested, then the refusal escapes and a later request may schedule again")
    void should_release_the_pending_request_when_requested_given_scheduler_refuses() {
        doThrow(new TaskRejectedException("shutting down")).doReturn(mock(ScheduledFuture.class))
                .when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        assertThatThrownBy(scheduler::requestImport).isInstanceOf(TaskRejectedException.class);
        assertThat(scheduler.inProgress()).isFalse();
        scheduler.requestImport();

        verify(taskScheduler, times(2)).schedule(any(Runnable.class), eq(NOW));
    }

    @Test
    @DisplayName("Given a requested import, when it runs, then the service imports on demand with the cooldown and nothing is in progress afterwards")
    void should_import_on_demand_and_finish_when_requested_run_executes_given_completed_import() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importOnDemand(SETTINGS, COOLDOWN)).thenReturn(Optional.of(completed(ON_DEMAND)));
        scheduler.requestImport();

        scheduledFollowUp().run();

        verify(service).importOnDemand(SETTINGS, COOLDOWN);
        assertThat(scheduler.inProgress()).isFalse();
    }

    @Test
    @DisplayName("Given a requested import that ran, when another import is requested, then a new on-demand run is scheduled")
    void should_schedule_again_when_requested_given_previous_on_demand_run_finished() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importOnDemand(SETTINGS, COOLDOWN)).thenReturn(Optional.empty());
        scheduler.requestImport();
        scheduledFollowUp().run();

        scheduler.requestImport();

        verify(taskScheduler, times(2)).schedule(any(Runnable.class), eq(NOW));
    }

    @Test
    @DisplayName("Given an import is running, when the progress is asked, then the scheduler reports work in progress")
    void should_report_progress_when_asked_given_import_running() {
        when(service.importIncomingPayments(any(), any())).thenAnswer(invocation -> {
            assertThat(scheduler.inProgress()).isTrue();
            return completed(STARTUP);
        });

        scheduler.tick();

        assertThat(scheduler.inProgress()).isFalse();
    }

    @Test
    @DisplayName("Given Fio refused the on-demand run, when the progress is asked, then the pending follow-up counts as work in progress until it is done")
    void should_report_progress_when_asked_given_pending_follow_up_after_on_demand_run() {
        ScheduledFuture<?> onDemand = mock(ScheduledFuture.class);
        ScheduledFuture<?> followUp = mock(ScheduledFuture.class);
        doReturn(onDemand).doReturn(followUp).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importOnDemand(SETTINGS, COOLDOWN))
                .thenReturn(Optional.of(failed(ON_DEMAND, ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, ON_DEMAND))));
        when(followUps.after(any())).thenReturn(Optional.of(new FollowUp(RETRY_AT, ON_DEMAND)));
        scheduler.requestImport();
        scheduledFollowUp().run();

        assertThat(scheduler.inProgress()).isTrue();
        when(followUp.isDone()).thenReturn(true);
        assertThat(scheduler.inProgress()).isFalse();
        verify(taskScheduler).schedule(any(Runnable.class), eq(RETRY_AT));
    }

    @Test
    @DisplayName("Given nothing queued, when older payments are requested twice, then one history run is scheduled at the first run's time and it imports the latest run")
    void should_schedule_one_history_run_with_latest_run_when_requested_twice_given_nothing_queued() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importHistory(any(), any())).thenReturn(history(null, null));
        allRunsDue();

        scheduler.requestHistoryImport(run(1, LocalDate.parse("2025-01-01"), STARTS_AT));
        scheduler.requestHistoryImport(run(2, HISTORY_FROM, NOW));
        assertThat(scheduler.inProgress()).isTrue();
        scheduledFollowUp().run();

        verify(taskScheduler, times(1)).schedule(any(Runnable.class), eq(STARTS_AT));
        verify(service).importHistory(run(2, HISTORY_FROM, NOW), SETTINGS);
        verify(service, times(1)).importHistory(any(), any());
        assertThat(scheduler.inProgress()).isFalse();
        assertThat(scheduler.enabled()).isTrue();
    }

    @Test
    @DisplayName("Given a newer run already handed over, when an older run's handover arrives late, then the queued task still imports the newer run")
    void should_import_newer_run_when_older_handover_arrives_late_given_newer_run_handed_over() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importHistory(any(), any())).thenReturn(history(null, null));
        allRunsDue();

        scheduler.requestHistoryImport(run(2, HISTORY_FROM, NOW));
        scheduler.requestHistoryImport(run(1, LocalDate.parse("2025-01-01"), NOW));
        scheduledFollowUp().run();

        verify(service).importHistory(run(2, HISTORY_FROM, NOW), SETTINGS);
        verify(service, times(1)).importHistory(any(), any());
    }

    @Test
    @DisplayName("Given a history run refused by the bank's 30-second limit, when the scheduler ticks before the follow-up, then the history follow-up stays and imports the same run")
    void should_keep_history_follow_up_across_tick_when_refused_given_rate_limit() {
        ScheduledFuture<?> queued = mock(ScheduledFuture.class);
        ScheduledFuture<?> followUp = mock(ScheduledFuture.class);
        doReturn(queued).doReturn(followUp).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        ImportReport heldBack = history(ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, HISTORY));
        when(service.importHistory(any(), any())).thenReturn(heldBack).thenReturn(history(null, null));
        when(service.importIncomingPayments(any(), any())).thenReturn(completed(STARTUP));
        allRunsDue();
        when(followUps.afterHistory(run(1, HISTORY_FROM, NOW), heldBack)).thenReturn(Optional.of(RETRY_AT));
        scheduler.requestHistoryImport(run(1, HISTORY_FROM, NOW));
        scheduledFollowUp().run();

        scheduler.tick();
        assertThat(scheduler.inProgress()).isTrue();
        scheduledFollowUp().run();

        verify(taskScheduler).schedule(any(Runnable.class), eq(RETRY_AT));
        verify(followUp, never()).cancel(anyBoolean());
        verify(service, times(2)).importHistory(run(1, HISTORY_FROM, NOW), SETTINGS);
    }

    @Test
    @DisplayName("Given a history follow-up waiting, when a newer run is requested, then the waiting follow-up is cancelled and the newer run is scheduled at its time")
    void should_cancel_waiting_follow_up_and_schedule_newer_run_when_requested_given_history_follow_up_waiting() {
        ScheduledFuture<?> waiting = mock(ScheduledFuture.class);
        doReturn(mock(ScheduledFuture.class)).doReturn(waiting).doReturn(mock(ScheduledFuture.class))
                .when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importHistory(any(), any())).thenReturn(history(ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, HISTORY)));
        allRunsDue();
        when(followUps.afterHistory(any(), any())).thenReturn(Optional.of(RETRY_AT));
        scheduler.requestHistoryImport(run(1, HISTORY_FROM, NOW));
        scheduledFollowUp().run();

        scheduler.requestHistoryImport(run(2, HISTORY_FROM, STARTS_AT));
        scheduledFollowUp().run();

        verify(waiting).cancel(false);
        verify(taskScheduler).schedule(any(Runnable.class), eq(STARTS_AT));
        verify(service).importHistory(run(2, HISTORY_FROM, STARTS_AT), SETTINGS);
    }

    @Test
    @DisplayName("Given another import still running when the history run is due, when it fires, then it is put off until the time the follow-ups give without asking them for a follow-up, and runs then")
    void should_put_off_until_follow_ups_time_without_follow_up_when_due_given_another_import_running() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importHistory(any(), any())).thenReturn(history(null, null));
        allRunsDue();
        when(followUps.putOffWhileBusy()).thenReturn(PUT_OFF_UNTIL);
        when(service.importIncomingPayments(any(), any())).thenAnswer(invocation -> {
            scheduler.requestHistoryImport(run(3, HISTORY_FROM, NOW));
            scheduledFollowUp().run();
            return completed(STARTUP);
        });

        scheduler.tick();
        verify(service, never()).importHistory(any(), any());
        verify(followUps, never()).afterHistory(any(), any());
        scheduledFollowUp().run();

        verify(taskScheduler).schedule(any(Runnable.class), eq(PUT_OFF_UNTIL));
        verify(service).importHistory(run(3, HISTORY_FROM, NOW), SETTINGS);
    }

    @Test
    @DisplayName("Given a run replaced by a newer request while its follow-up waits, when the old follow-up fires, then it imports nothing")
    void should_import_nothing_when_old_follow_up_fires_given_run_replaced() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importHistory(any(), any())).thenReturn(history(ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, HISTORY)));
        when(followUps.due(run(1, HISTORY_FROM, NOW))).thenReturn(true, false);
        when(followUps.afterHistory(any(), any())).thenReturn(Optional.of(RETRY_AT));
        scheduler.requestHistoryImport(run(1, HISTORY_FROM, NOW));
        scheduledFollowUp().run();
        Runnable oldFollowUp = scheduledFollowUp();

        oldFollowUp.run();

        verify(service, times(1)).importHistory(any(), any());
    }

    @Test
    @DisplayName("Given a history run the bank held back, when the follow-ups give it no next time, then no follow-up is scheduled for it")
    void should_schedule_no_follow_up_when_follow_ups_give_no_time_given_history_run_held_back() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        ImportReport heldBack = history(ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, HISTORY));
        when(service.importHistory(any(), any())).thenReturn(heldBack);
        allRunsDue();
        when(followUps.afterHistory(run(1, HISTORY_FROM, NOW), heldBack)).thenReturn(Optional.empty());
        scheduler.requestHistoryImport(run(1, HISTORY_FROM, NOW));

        scheduledFollowUp().run();

        verify(followUps).afterHistory(run(1, HISTORY_FROM, NOW), heldBack);
        verify(taskScheduler, never()).schedule(any(Runnable.class), eq(RETRY_AT));
        assertThat(scheduler.inProgress()).isFalse();
    }

    @Test
    @DisplayName("Given the task scheduler refuses the history run, when older payments are requested, then the refusal escapes and a later request may schedule again")
    void should_release_the_queued_history_run_when_requested_given_scheduler_refuses() {
        doThrow(new TaskRejectedException("shutting down")).doReturn(mock(ScheduledFuture.class))
                .when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));

        assertThatThrownBy(() -> scheduler.requestHistoryImport(run(1, HISTORY_FROM, NOW))).isInstanceOf(TaskRejectedException.class);
        assertThat(scheduler.inProgress()).isFalse();
        scheduler.requestHistoryImport(run(2, HISTORY_FROM, NOW));

        verify(taskScheduler, times(2)).schedule(any(Runnable.class), eq(NOW));
    }

    @Test
    @DisplayName("Given the task scheduler refuses a history follow-up, when the bank holds the run back, then the run is abandoned instead of waiting forever")
    void should_abandon_run_when_follow_up_refused_given_scheduler_refuses() {
        doReturn(mock(ScheduledFuture.class)).doThrow(new TaskRejectedException("shutting down"))
                .when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importHistory(any(), any())).thenReturn(history(ImportFailureKind.RATE_LIMITED, new FollowUp(RETRY_AT, HISTORY)));
        allRunsDue();
        when(followUps.afterHistory(any(), any())).thenReturn(Optional.of(RETRY_AT));
        scheduler.requestHistoryImport(run(1, HISTORY_FROM, NOW));

        scheduledFollowUp().run();

        verify(followUps).notRescheduled(run(1, HISTORY_FROM, NOW));
        assertThat(messages(Level.WARN)).contains("Fio import HISTORY run 1 could not be scheduled again (TaskRejectedException); it ends as failed");
    }

    @Test
    @DisplayName("Given locked history on a history run, when it fails, then a warning tells the operator to unlock it and press the button, and that it waits to be requested again")
    void should_warn_with_unlock_instruction_when_history_run_fails_given_locked_history() {
        doReturn(mock(ScheduledFuture.class)).when(taskScheduler).schedule(any(Runnable.class), any(Instant.class));
        when(service.importHistory(any(), any())).thenReturn(history(ImportFailureKind.HISTORY_LOCKED, null));
        allRunsDue();
        scheduler.requestHistoryImport(run(1, HISTORY_FROM, NOW));

        scheduledFollowUp().run();

        assertThat(messages(Level.WARN)).containsExactly(
                "Fio import HISTORY 2026-01-01/2026-10-17 failed with HISTORY_LOCKED (" + FAILURE_MESSAGE + "): unlock the history in Fio internet banking "
                        + "(Nastavení > API, the lock icon) and press Načíst starší platby on /sprava within 10 minutes; it waits to be requested again");
    }

    private static HistoryImportRun run(long id, LocalDate from, Instant startsAt) {
        return HistoryImportRun.queued(id, new ImportPeriod(from, LocalDate.parse("2026-10-17")), true, NOW, startsAt);
    }

    private void allRunsDue() {
        when(followUps.due(any())).thenReturn(true);
    }

    private static ImportReport history(ImportFailureKind kind, FollowUp followUp) {
        return new ImportReport(HISTORY, HISTORY_PERIOD, true, Optional.empty(), ImportCoverage.none(), ImportCounts.none(),
                Optional.ofNullable(kind), Optional.ofNullable(kind).map(failure -> FAILURE_MESSAGE), Optional.ofNullable(followUp));
    }

    private Runnable scheduledFollowUp() {
        ArgumentCaptor<Runnable> tasks = ArgumentCaptor.forClass(Runnable.class);
        verify(taskScheduler, atLeastOnce()).schedule(tasks.capture(), any(Instant.class));
        return tasks.getAllValues().getLast();
    }

    private List<String> messages(Level level) {
        return log.list.stream().filter(event -> event.getLevel() == level).map(ILoggingEvent::getFormattedMessage).toList();
    }

    private static ImportReport completed(ImportTrigger trigger) {
        return new ImportReport(trigger, REQUESTED, false, Optional.of(REQUESTED), new ImportCoverage(REQUESTED.from(), REQUESTED.to()),
                ImportCounts.none(), Optional.empty(), Optional.empty(), Optional.empty());
    }

    private static ImportReport failed(ImportTrigger trigger, ImportFailureKind kind, FollowUp followUp) {
        return failed(trigger, kind, followUp, true);
    }

    private static ImportReport failed(ImportTrigger trigger, ImportFailureKind kind, FollowUp followUp, boolean needsUnlockedHistory) {
        return new ImportReport(trigger, REQUESTED, needsUnlockedHistory, Optional.empty(), ImportCoverage.none(), ImportCounts.none(),
                Optional.of(kind), Optional.of(FAILURE_MESSAGE), Optional.ofNullable(followUp));
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(FioImportScheduler.class);
    }
}
