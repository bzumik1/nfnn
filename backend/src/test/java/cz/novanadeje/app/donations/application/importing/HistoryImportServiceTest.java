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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
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

        assertThat(run).isEqualTo(HistoryImportRun.queued(new ImportPeriod(LocalDate.of(2026, 1, 1), TODAY), true, NOW, NOW));
        verify(imports).requestHistoryImport(LocalDate.of(2026, 1, 1), NOW);
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
        verify(imports).requestHistoryImport(LocalDate.of(2026, 9, 1), NOW.plusSeconds(20));
    }

    @Test
    @DisplayName("Given a scheduler that runs the request at once, when older payments are asked for, then the answer is the run as it ended")
    void should_answer_the_finished_run_when_requested_given_scheduler_runs_at_once() {
        when(imports.enabled()).thenReturn(true);
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        doAnswer(invocation -> {
            tracker.started(LocalDate.of(2026, 1, 1));
            tracker.abandoned(ImportFailureKind.UNEXPECTED, NOW);
            return null;
        }).when(imports).requestHistoryImport(any(), any());

        HistoryImportRun run = service.request(ADMIN, LocalDate.of(2026, 1, 1));

        assertThat(run.status()).isEqualTo(HistoryImportStatus.FAILED);
    }

    @Test
    @DisplayName("Given a start tomorrow, when older payments are asked for, then the request is refused before anything is audited or queued")
    void should_refuse_without_audit_when_requested_given_start_tomorrow() {
        when(imports.enabled()).thenReturn(true);

        assertThatThrownBy(() -> service.request(ADMIN, TODAY.plusDays(1))).isInstanceOf(HistoryStartInFuture.class);
        assertThatThrownBy(() -> service.request(ADMIN, LocalDate.of(1999, 12, 31))).isInstanceOf(HistoryStartTooEarly.class);

        verify(events, never()).publishEvent(any());
        verify(imports, never()).requestHistoryImport(any(), any());
        assertThat(tracker.last()).isEmpty();
    }

    @Test
    @DisplayName("Given no Fio token, when older payments are asked for, then the request is refused as the import being off")
    void should_refuse_as_import_off_when_requested_given_no_token() {
        when(imports.enabled()).thenReturn(false);

        assertThatThrownBy(() -> service.request(ADMIN, LocalDate.of(2026, 1, 1))).isInstanceOf(BankImportOff.class);

        verify(events, never()).publishEvent(any());
    }
}
