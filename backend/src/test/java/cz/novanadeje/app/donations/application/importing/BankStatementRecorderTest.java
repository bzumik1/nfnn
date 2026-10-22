package cz.novanadeje.app.donations.application.importing;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportPlan;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BankStatementRecorderTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final ImportPeriod HOURLY_REQUEST = period("2026-10-12", "2026-10-18");
    private static final ImportPeriod DEEP_REQUEST = period("2025-01-01", "2026-10-18");

    @Mock
    private BankPaymentRepository payments;
    @Mock
    private PaymentPairingService pairing;
    @Mock
    private BankImportStateRepository states;

    private BankStatementRecorder recorder;
    private ListAppender<ILoggingEvent> log;

    @BeforeEach
    void setUp() {
        recorder = new BankStatementRecorder(payments, pairing, states);
        log = new ListAppender<>();
        log.start();
        logger().addAppender(log);
    }

    @AfterEach
    void tearDown() {
        logger().detachAppender(log);
    }

    @Test
    @DisplayName("Given a statement with a known and a new movement, when it is recorded, then only the new one is saved, before pairing, and the counts tell both")
    void should_save_only_new_movements_before_pairing_when_recorded_given_known_movement() {
        stateCovering("2026-07-18", "2026-10-15");
        when(payments.findKnownTransactionIds(anyCollection())).thenReturn(Set.of(new BankTransactionId(1001)));
        when(pairing.pairUnpaired(NOW)).thenReturn(new PairingOutcome(1, 2, 5, 3, 4));
        BankStatement statement = new BankStatement(HOURLY_REQUEST, Optional.empty(), List.of(movement(1001), movement(1002)), 5);

        ImportCounts counts = recorder.record(statement, new ImportPlan(HOURLY_REQUEST, false), NOW);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<BankPayment>> saved = ArgumentCaptor.forClass(List.class);
        InOrder order = inOrder(payments, pairing, states);
        order.verify(payments).findKnownTransactionIds(List.of(new BankTransactionId(1001), new BankTransactionId(1002)));
        order.verify(payments).saveAll(saved.capture());
        order.verify(pairing).pairUnpaired(NOW);
        order.verify(states).save(any());
        assertThat(saved.getValue()).singleElement().satisfies(payment -> {
            assertThat(payment.transactionId()).isEqualTo(new BankTransactionId(1002));
            assertThat(payment.importedAt()).isEqualTo(NOW);
        });
        assertThat(counts).isEqualTo(new ImportCounts(5, 1, 1, 1, 2, 5, 3, 4));
    }

    @Test
    @DisplayName("Given the same movement twice in one statement, when it is recorded, then it is saved once")
    void should_save_once_when_recorded_given_duplicate_movement_in_statement() {
        stateCovering("2026-07-18", "2026-10-15");
        when(payments.findKnownTransactionIds(anyCollection())).thenReturn(Set.of());
        when(pairing.pairUnpaired(NOW)).thenReturn(new PairingOutcome(0, 0, 0, 0, 0));

        ImportCounts counts = recorder.record(new BankStatement(HOURLY_REQUEST, Optional.empty(), List.of(movement(1001), movement(1001)), 2),
                new ImportPlan(HOURLY_REQUEST, false), NOW);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<BankPayment>> saved = ArgumentCaptor.forClass(List.class);
        verify(payments).saveAll(saved.capture());
        assertThat(saved.getValue()).hasSize(1);
        assertThat(counts.incomingNew()).isEqualTo(1);
        assertThat(counts.incomingKnown()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a plan inside the window, when the bank reports a smaller period, then the coverage is extended by the requested period")
    void should_cover_requested_period_when_recorded_given_shallow_plan_and_smaller_report() {
        BankImportState state = stateCovering("2026-07-18", "2026-10-15");
        noMovementsKnownAndNothingPaired();

        recorder.record(new BankStatement(HOURLY_REQUEST, Optional.of(period("2026-10-18", "2026-10-18")), List.of(), 0),
                new ImportPlan(HOURLY_REQUEST, false), NOW);

        verify(states).save(state);
        assertThat(state.coverage()).isEqualTo(coverage("2026-07-18", "2026-10-18"));
        assertThat(state.lastSucceededAt()).contains(NOW);
        assertThat(warnings()).isEmpty();
    }

    @Test
    @DisplayName("Given a deep plan, when the bank reports a period, then the coverage is extended by the reported period")
    void should_cover_reported_period_when_recorded_given_deep_plan() {
        BankImportState state = stateCovering("2026-07-21", "2026-10-18");
        noMovementsKnownAndNothingPaired();

        recorder.record(new BankStatement(DEEP_REQUEST, Optional.of(period("2025-02-03", "2026-10-18")), List.of(), 0),
                new ImportPlan(DEEP_REQUEST, true), NOW);

        assertThat(state.coverage()).isEqualTo(coverage("2025-02-03", "2026-10-18"));
    }

    @Test
    @DisplayName("Given a deep plan, when the bank reports no period, then the coverage is extended by the requested period")
    void should_cover_requested_period_when_recorded_given_deep_plan_without_report() {
        BankImportState state = stateCovering("2026-07-21", "2026-10-18");
        noMovementsKnownAndNothingPaired();

        recorder.record(new BankStatement(DEEP_REQUEST, Optional.empty(), List.of(), 0), new ImportPlan(DEEP_REQUEST, true), NOW);

        assertThat(state.coverage()).isEqualTo(coverage("2025-01-01", "2026-10-18"));
    }

    @Test
    @DisplayName("Given a coverage that ended long ago, when a clamped period is recorded, then the coverage is replaced and the gap is logged with the fix")
    void should_log_gap_when_recorded_given_detached_period() {
        BankImportState state = stateCovering("2026-01-01", "2026-03-31");
        noMovementsKnownAndNothingPaired();
        ImportPeriod clamped = period("2026-07-21", "2026-10-18");

        recorder.record(new BankStatement(clamped, Optional.empty(), List.of(), 0), new ImportPlan(clamped, false), NOW);

        assertThat(state.coverage()).isEqualTo(coverage("2026-07-21", "2026-10-18"));
        assertThat(warnings()).containsExactly("Fio movements between 2026-04-01 and 2026-07-20 were not downloaded; "
                + "unlock the history in Fio internet banking, set FIO_HISTORY_FROM=2026-04-01 and restart the backend");
    }

    @Test
    @DisplayName("Given the bank reports a period outside the request, when it is recorded, then a sanity warning is logged")
    void should_warn_when_recorded_given_report_outside_request() {
        stateCovering("2026-07-18", "2026-10-15");
        noMovementsKnownAndNothingPaired();

        recorder.record(new BankStatement(HOURLY_REQUEST, Optional.of(period("2026-10-01", "2026-10-18")), List.of(), 0),
                new ImportPlan(HOURLY_REQUEST, false), NOW);

        assertThat(warnings()).containsExactly("Fio reported 2026-10-01/2026-10-18 for a request of 2026-10-12/2026-10-18");
    }

    @Test
    @DisplayName("Given a failure, when it is recorded, then the state keeps its coverage and carries the failure")
    void should_record_failure_on_state_when_failure_recorded() {
        BankImportState state = stateCovering("2026-07-18", "2026-10-15");

        recorder.recordFailure(ImportFailureKind.TRANSPORT, "timed out", NOW);

        verify(states).save(state);
        assertThat(state.coverage()).isEqualTo(coverage("2026-07-18", "2026-10-15"));
        assertThat(state.lastFailureKind()).contains(ImportFailureKind.TRANSPORT);
        assertThat(state.lastFailureMessage()).contains("timed out");
        assertThat(state.lastAttemptedAt()).contains(NOW);
    }

    private BankImportState stateCovering(String from, String to) {
        BankImportState state = BankImportState.initial(NOW);
        state.succeeded(coverage(from, to), Instant.parse("2026-10-15T10:00:00Z"));
        when(states.current()).thenReturn(state);
        return state;
    }

    private void noMovementsKnownAndNothingPaired() {
        when(payments.findKnownTransactionIds(anyCollection())).thenReturn(Set.of());
        when(pairing.pairUnpaired(NOW)).thenReturn(new PairingOutcome(0, 0, 0, 0, 0));
    }

    private List<String> warnings() {
        return log.list.stream().filter(event -> event.getLevel() == Level.WARN).map(ILoggingEvent::getFormattedMessage).toList();
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(BankStatementRecorder.class);
    }

    private static IncomingMovement movement(long id) {
        return IncomingMovement.of(new BankTransactionId(id), LocalDate.of(2026, 10, 15), Money.czk(50000),
                SenderAccount.parse("2900233333", "2010"), Optional.of("2900233333"), Optional.of("2010"), Optional.of("Nováková Jana"),
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), "Bezhotovostní příjem");
    }

    private static ImportPeriod period(String from, String to) {
        return new ImportPeriod(LocalDate.parse(from), LocalDate.parse(to));
    }

    private static ImportCoverage coverage(String from, String to) {
        return new ImportCoverage(LocalDate.parse(from), LocalDate.parse(to));
    }
}
