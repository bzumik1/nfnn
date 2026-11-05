package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankImportOff;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.HistoryStartInFuture;
import cz.novanadeje.app.donations.domain.importing.HistoryStartTooEarly;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HistoryImportServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 5);
    private static final UUID ADMIN = UUID.fromString("0190a0b0-0000-7000-8000-000000000001");
    private static final BankImportProperties PROPERTIES = new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "", Duration.ofSeconds(30));

    @Mock
    private BankImportRequests imports;
    @Mock
    private BankImportStateRepository states;
    @Mock
    private ApplicationEventPublisher events;

    private final HistoryImportTracker tracker = new HistoryImportTracker();
    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("UTC"));
    private HistoryImportService service;

    @BeforeEach
    void setUp() {
        TransactionTemplate transaction = new TransactionTemplate(mock(PlatformTransactionManager.class));
        service = new HistoryImportService(imports, states, PROPERTIES, tracker, events, transaction, clock);
    }

    @Test
    @DisplayName("Given no recent attempt, when an administrator asks for older payments, then the run is queued now, audited with the day and handed to the scheduler")
    void should_queue_now_audit_and_hand_over_when_requested_given_no_recent_attempt() {
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(BankImportState.initial(NOW.minusSeconds(3600)));

        HistoryImportRun run = service.request(ADMIN, LocalDate.of(2026, 1, 1));

        assertThat(run).isEqualTo(HistoryImportRun.queued(run.id(), new ImportPeriod(LocalDate.of(2026, 1, 1), TODAY), true, NOW, NOW));
        verify(imports).requestHistoryImport(run);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue()).isEqualTo(new AdminActionPerformed(ADMIN, "REQUEST_HISTORY_IMPORT", Optional.empty(),
                "Vyžádáno načtení starších plateb z banky od 2026-01-01", NOW));
        assertThat(tracker.last()).contains(run);
    }

    @Test
    @DisplayName("Given an import attempted ten seconds ago, when older payments are asked for, then the run starts when the bank's 30 seconds are over")
    void should_start_after_the_cooldown_when_requested_given_attempt_ten_seconds_ago() {
        BankImportState attempted = BankImportState.initial(NOW);
        attempted.failed(ImportFailureKind.TRANSPORT, "timed out", NOW.minusSeconds(10));
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(attempted);

        HistoryImportRun run = service.request(ADMIN, LocalDate.of(2026, 9, 1));

        assertThat(run.startsAt()).isEqualTo(NOW.plusSeconds(20));
        assertThat(run.needsUnlockedHistory()).isFalse();
        verify(imports).requestHistoryImport(run);
    }

    @Test
    @DisplayName("Given a scheduler that runs the request at once, when older payments are asked for, then the answer is the run as it ended")
    void should_answer_the_finished_run_when_requested_given_scheduler_runs_at_once() {
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        doAnswer(invocation -> {
            HistoryImportRun handed = invocation.getArgument(0);
            tracker.started(handed.id());
            tracker.abandoned(handed.id(), ImportFailureKind.UNEXPECTED, NOW);
            return null;
        }).when(imports).requestHistoryImport(any());

        HistoryImportRun run = service.request(ADMIN, LocalDate.of(2026, 1, 1));

        assertThat(run.status()).isEqualTo(HistoryImportStatus.FAILED);
    }

    @Test
    @DisplayName("Given a start tomorrow, when older payments are asked for, then the request is refused before anything is audited or queued")
    void should_refuse_without_audit_when_requested_given_start_tomorrow() {
        when(imports.enabled()).thenReturn(true);

        assertThatThrownBy(() -> service.request(ADMIN, TODAY.plusDays(1))).isInstanceOf(HistoryStartInFuture.class);

        verify(events, never()).publishEvent(any());
        verify(imports, never()).requestHistoryImport(any());
        assertThat(tracker.last()).isEmpty();
    }

    @Test
    @DisplayName("Given a start before 2000, when older payments are asked for, then the request is refused before anything is audited or queued")
    void should_refuse_without_audit_when_requested_given_start_before_2000() {
        when(imports.enabled()).thenReturn(true);

        assertThatThrownBy(() -> service.request(ADMIN, LocalDate.of(1999, 12, 31))).isInstanceOf(HistoryStartTooEarly.class);

        verify(events, never()).publishEvent(any());
        verify(imports, never()).requestHistoryImport(any());
        assertThat(tracker.last()).isEmpty();
    }

    @Test
    @DisplayName("Given an import attempted exactly 30 seconds ago, when older payments are asked for, then the run starts now")
    void should_start_now_when_requested_given_attempt_exactly_thirty_seconds_ago() {
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(attemptedAt(NOW.minusSeconds(30)));

        assertThat(service.request(ADMIN, LocalDate.of(2026, 9, 1)).startsAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given an import attempted 31 seconds ago, when older payments are asked for, then the run starts now and never in the past")
    void should_start_now_when_requested_given_attempt_thirty_one_seconds_ago() {
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(attemptedAt(NOW.minusSeconds(31)));

        assertThat(service.request(ADMIN, LocalDate.of(2026, 9, 1)).startsAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a deeper run still queued, when a later day is asked for, then the queued run keeps its earlier day and the audit names the day asked for")
    void should_keep_earlier_day_when_requested_given_deeper_run_queued() {
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        service.request(ADMIN, LocalDate.of(2025, 1, 1));

        HistoryImportRun run = service.request(ADMIN, LocalDate.of(2026, 10, 1));

        assertThat(run.requested().from()).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(run.needsUnlockedHistory()).isTrue();
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events, times(2)).publishEvent(audited.capture());
        assertThat(audited.getAllValues().getLast().details()).isEqualTo("Vyžádáno načtení starších plateb z banky od 2026-10-01");
    }

    @Test
    @DisplayName("Given a shallower run still queued, when an earlier day is asked for, then the new run starts from the earlier day and needs the unlocked history")
    void should_start_from_earlier_day_when_requested_given_shallower_run_queued() {
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        service.request(ADMIN, LocalDate.of(2026, 10, 1));

        HistoryImportRun run = service.request(ADMIN, LocalDate.of(2025, 1, 1));

        assertThat(run.requested().from()).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(run.needsUnlockedHistory()).isTrue();
    }

    @Test
    @DisplayName("Given a deeper run that already ended, when a later day is asked for, then the new run starts from the later day")
    void should_start_from_later_day_when_requested_given_deeper_run_ended() {
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        HistoryImportRun deep = service.request(ADMIN, LocalDate.of(2025, 1, 1));
        tracker.abandoned(deep.id(), ImportFailureKind.HISTORY_LOCKED, NOW);

        HistoryImportRun run = service.request(ADMIN, LocalDate.of(2026, 10, 1));

        assertThat(run.requested().from()).isEqualTo(LocalDate.of(2026, 10, 1));
    }

    @Test
    @DisplayName("Given a scheduler that refuses the run, when older payments are asked for, then the run ends as failed instead of staying queued and the refusal goes on")
    void should_end_failed_when_requested_given_scheduler_refuses() {
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        doThrow(new IllegalStateException("shutting down")).when(imports).requestHistoryImport(any());

        assertThatThrownBy(() -> service.request(ADMIN, LocalDate.of(2026, 1, 1))).isInstanceOf(IllegalStateException.class);

        assertThat(tracker.last()).map(HistoryImportRun::status).contains(HistoryImportStatus.FAILED);
        assertThat(tracker.last()).flatMap(HistoryImportRun::failure).contains(ImportFailureKind.UNEXPECTED);
    }

    private static BankImportState attemptedAt(Instant at) {
        BankImportState attempted = BankImportState.initial(at);
        attempted.failed(ImportFailureKind.TRANSPORT, "timed out", at);
        return attempted;
    }

    @Test
    @DisplayName("Given no Fio token, when older payments are asked for, then the request is refused as the import being off")
    void should_refuse_as_import_off_when_requested_given_no_token() {
        when(imports.enabled()).thenReturn(false);

        assertThatThrownBy(() -> service.request(ADMIN, LocalDate.of(2026, 1, 1))).isInstanceOf(BankImportOff.class);

        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a deeper request still reading the import state, when a later day is asked for at the same moment, then the later request waits for it and keeps the deeper day")
    void should_keep_deeper_day_when_requested_at_same_moment_given_deeper_request_in_progress() throws Exception {
        when(imports.enabled()).thenReturn(true);
        CountDownLatch deeperReading = new CountDownLatch(1);
        CountDownLatch laterArrived = new CountDownLatch(1);
        CountDownLatch deeperQueued = new CountDownLatch(1);
        AtomicInteger reads = new AtomicInteger();
        when(states.current()).thenAnswer(invocation -> {
            if (reads.incrementAndGet() == 1) {
                deeperReading.countDown();
                laterArrived.await(300, TimeUnit.MILLISECONDS);
            } else {
                laterArrived.countDown();
                deeperQueued.await(2, TimeUnit.SECONDS);
            }
            return BankImportState.initial(NOW.minusSeconds(3600));
        });
        doAnswer(invocation -> {
            deeperQueued.countDown();
            return null;
        }).when(imports).requestHistoryImport(any());
        ExecutorService threads = Executors.newFixedThreadPool(2);
        try {
            Future<HistoryImportRun> deeper = threads.submit(() -> service.request(ADMIN, LocalDate.of(2026, 1, 1)));
            assertThat(deeperReading.await(2, TimeUnit.SECONDS)).isTrue();
            Future<HistoryImportRun> later = threads.submit(() -> service.request(ADMIN, LocalDate.of(2026, 10, 1)));
            deeper.get(5, TimeUnit.SECONDS);
            later.get(5, TimeUnit.SECONDS);
        } finally {
            threads.shutdownNow();
        }

        assertThat(tracker.last()).map(run -> run.requested().from()).contains(LocalDate.of(2026, 1, 1));
    }
}
