package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportPlan;
import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ImportBankPaymentsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final ImportPeriod SERVABLE = new ImportPeriod(LocalDate.of(2026, 7, 20), LocalDate.of(2026, 10, 17));
    private static final ImportPeriod DEEP = new ImportPeriod(LocalDate.of(2025, 1, 1), LocalDate.of(2026, 10, 17));
    private static final ImportSettings DEEP_SETTINGS = ImportSettings.defaults().withHistoryFrom(LocalDate.of(2025, 1, 1));

    @Mock
    private BankStatementSource source;
    @Mock
    private BankStatementRecorder recorder;
    @Mock
    private BankImportStateRepository states;

    private MutableClock clock;
    private ImportBankPaymentsService service;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(NOW, ZoneId.of("UTC"));
        service = new ImportBankPaymentsService(source, recorder, states, clock);
    }

    @Test
    @DisplayName("Given no coverage yet, when the import runs, then it plans, fetches outside any repository call and records the statement")
    void should_plan_fetch_and_record_in_order_when_import_runs_given_no_coverage() {
        BankStatement statement = new BankStatement(SERVABLE, Optional.of(SERVABLE), List.of(), 3);
        ImportCounts counts = new ImportCounts(3, 1, 0, 0, 0, 0, 1);
        BankImportState covered = BankImportState.initial(NOW);
        covered.succeeded(ImportCoverage.of(SERVABLE), NOW);
        when(states.current()).thenReturn(BankImportState.initial(NOW), covered);
        when(source.fetch(SERVABLE)).thenAnswer(invocation -> {
            assertThat(mockingDetails(states).getInvocations()).hasSize(1);
            assertThat(mockingDetails(recorder).getInvocations()).isEmpty();
            return statement;
        });
        when(recorder.record(statement, new ImportPlan(SERVABLE, false), NOW)).thenReturn(counts);

        ImportReport report = service.importIncomingPayments(ImportTrigger.HOURLY, ImportSettings.defaults());

        InOrder order = inOrder(states, source, recorder);
        order.verify(states).current();
        order.verify(source).fetch(SERVABLE);
        order.verify(recorder).record(statement, new ImportPlan(SERVABLE, false), NOW);
        assertThat(report).isEqualTo(new ImportReport(ImportTrigger.HOURLY, SERVABLE, false, Optional.of(SERVABLE),
                ImportCoverage.of(SERVABLE), counts, Optional.empty(), Optional.empty()));
        assertThat(report.completed()).isTrue();
    }

    @Test
    @DisplayName("Given the Prague day has already begun while UTC is still on the previous day, when the import runs, then it asks up to the Prague today")
    void should_plan_up_to_prague_today_when_import_runs_given_utc_clock_late_in_the_evening() {
        clock.set(Instant.parse("2026-10-16T22:30:00Z"));
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        when(source.fetch(any())).thenThrow(unavailable(ImportFailureKind.TRANSPORT, Optional.empty()));

        ImportReport report = service.importIncomingPayments(ImportTrigger.HOURLY, ImportSettings.defaults());

        assertThat(report.requested()).isEqualTo(SERVABLE);
    }

    @Test
    @DisplayName("Given Fio refuses with the 30-second limit, when the import runs, then the failure is recorded after the answer and a follow-up with the same trigger is due a second after the bank's retry time")
    void should_follow_up_with_same_trigger_when_rate_limited() {
        Instant retryAfter = NOW.plusSeconds(30);
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        when(source.fetch(DEEP)).thenAnswer(invocation -> {
            clock.advance(Duration.ofSeconds(5));
            throw unavailable(ImportFailureKind.RATE_LIMITED, Optional.of(retryAfter));
        });

        ImportReport report = service.importIncomingPayments(ImportTrigger.STARTUP, DEEP_SETTINGS);

        verify(recorder).recordFailure(ImportFailureKind.RATE_LIMITED, "refused", NOW.plusSeconds(5));
        assertThat(report.followUp()).contains(new FollowUp(retryAfter.plusSeconds(1), ImportTrigger.STARTUP));
        assertThat(report.failure()).contains(ImportFailureKind.RATE_LIMITED);
        assertThat(report.completed()).isFalse();
        assertThat(report.counts()).isEqualTo(ImportCounts.none());
        assertThat(report.coverage()).isEqualTo(ImportCoverage.none());
        assertThat(report.reported()).isEmpty();
        assertThat(report.requested()).isEqualTo(DEEP);
        assertThat(report.needsUnlockedHistory()).isTrue();
    }

    @Test
    @DisplayName("Given a deep plan and a locked history, when the import runs, then a follow-up asks hourly a second after the bank's retry time")
    void should_follow_up_hourly_when_history_locked_given_deep_plan() {
        Instant retryAfter = NOW.plusSeconds(35);
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        when(source.fetch(DEEP)).thenThrow(unavailable(ImportFailureKind.HISTORY_LOCKED, Optional.of(retryAfter)));

        ImportReport report = service.importIncomingPayments(ImportTrigger.STARTUP, DEEP_SETTINGS);

        verify(recorder).recordFailure(ImportFailureKind.HISTORY_LOCKED, "refused", NOW);
        assertThat(report.followUp()).contains(new FollowUp(retryAfter.plusSeconds(1), ImportTrigger.HOURLY));
        assertThat(report.failure()).contains(ImportFailureKind.HISTORY_LOCKED);
    }

    @Test
    @DisplayName("Given a plan inside the window and a locked history, when the import runs, then the failure is recorded and no follow-up is due")
    void should_not_follow_up_when_history_locked_given_shallow_plan() {
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        when(source.fetch(SERVABLE)).thenThrow(unavailable(ImportFailureKind.HISTORY_LOCKED, Optional.of(NOW.plusSeconds(30))));

        ImportReport report = service.importIncomingPayments(ImportTrigger.STARTUP, ImportSettings.defaults());

        verify(recorder).recordFailure(ImportFailureKind.HISTORY_LOCKED, "refused", NOW);
        assertThat(report.followUp()).isEmpty();
    }

    @ParameterizedTest
    @EnumSource(value = ImportFailureKind.class, names = {"UNAUTHORIZED", "TRANSPORT", "INVALID_RESPONSE", "UNEXPECTED"})
    @DisplayName("Given any other refusal, when the import runs, then it is recorded with its kind and the next hourly run retries")
    void should_record_without_follow_up_when_refused_given_other_kinds(ImportFailureKind kind) {
        BankImportState covered = BankImportState.initial(NOW);
        covered.succeeded(ImportCoverage.of(SERVABLE), NOW);
        when(states.current()).thenReturn(covered);
        when(source.fetch(any())).thenThrow(unavailable(kind, Optional.empty()));

        ImportReport report = service.importIncomingPayments(ImportTrigger.HOURLY, ImportSettings.defaults());

        verify(recorder).recordFailure(kind, "refused", NOW);
        verify(recorder, never()).record(any(), any(), any());
        assertThat(report.failure()).contains(kind);
        assertThat(report.followUp()).isEmpty();
        assertThat(report.coverage()).isEqualTo(ImportCoverage.of(SERVABLE));
    }

    @Test
    @DisplayName("Given the source fails unexpectedly, when the import runs, then the failure is recorded as unexpected and rethrown")
    void should_record_and_rethrow_when_source_fails_unexpectedly() {
        IllegalStateException failure = new IllegalStateException("Fio import is disabled: FIO_TOKEN is not set");
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        when(source.fetch(any())).thenThrow(failure);

        assertThatThrownBy(() -> service.importIncomingPayments(ImportTrigger.HOURLY, ImportSettings.defaults())).isSameAs(failure);

        verify(recorder).recordFailure(ImportFailureKind.UNEXPECTED, "Fio import is disabled: FIO_TOKEN is not set", NOW);
    }

    @Test
    @DisplayName("Given recording the statement fails, when the import runs, then the failure is recorded as unexpected and rethrown")
    void should_record_and_rethrow_when_recording_fails() {
        BankStatement statement = new BankStatement(SERVABLE, Optional.empty(), List.of(), 0);
        IllegalStateException failure = new IllegalStateException("pairing failed for payment 1001");
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        when(source.fetch(SERVABLE)).thenReturn(statement);
        when(recorder.record(any(), any(), any())).thenThrow(failure);

        assertThatThrownBy(() -> service.importIncomingPayments(ImportTrigger.HOURLY, ImportSettings.defaults())).isSameAs(failure);

        verify(recorder).recordFailure(ImportFailureKind.UNEXPECTED, "pairing failed for payment 1001", NOW);
    }

    @Test
    @DisplayName("Given an unexpected failure without a message, when the import runs, then its type is recorded as the message")
    void should_record_exception_type_when_failing_given_no_message() {
        NullPointerException failure = new NullPointerException();
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        when(source.fetch(any())).thenThrow(failure);

        assertThatThrownBy(() -> service.importIncomingPayments(ImportTrigger.HOURLY, ImportSettings.defaults())).isSameAs(failure);

        verify(recorder).recordFailure(ImportFailureKind.UNEXPECTED, "java.lang.NullPointerException", NOW);
    }

    private static BankStatementUnavailable unavailable(ImportFailureKind kind, Optional<Instant> retryAfter) {
        return new BankStatementUnavailable(kind, retryAfter, "refused", null);
    }
}
