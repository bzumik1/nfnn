package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.application.event.BankImportOutageDetected;
import cz.novanadeje.app.donations.application.event.BankImportRecovered;
import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.CoverageChange;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportPlan;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class BankStatementRecorder {

    private static final Logger log = LoggerFactory.getLogger(BankStatementRecorder.class);

    private final BankPaymentRepository payments;
    private final PaymentPairingService pairing;
    private final BankImportStateRepository states;
    private final ApplicationEventPublisher events;

    public BankStatementRecorder(BankPaymentRepository payments, PaymentPairingService pairing, BankImportStateRepository states,
                                 ApplicationEventPublisher events) {
        this.payments = payments;
        this.pairing = pairing;
        this.states = states;
        this.events = events;
    }

    @Transactional
    public ImportCounts record(BankStatement statement, ImportPlan plan, Instant now) {
        List<BankPayment> fresh = freshPayments(statement.incoming(), now);
        payments.saveAll(fresh);
        PairingOutcome outcome = pairing.pairUnpaired(now);
        extendCoverage(statement, plan, now);
        return new ImportCounts(statement.movementsReceived(), fresh.size(), statement.incoming().size() - fresh.size(),
                outcome.pairedBySymbol(), outcome.pairedByAccount(), outcome.pairedByConfirmedSymbol(), outcome.accountsLearned(),
                outcome.leftUnpaired());
    }

    @Transactional
    public void recordFailure(ImportFailureKind kind, String message, Instant at) {
        BankImportState state = states.current();
        state.failed(kind, message, at).ifPresent(outage -> {
            log.error("Fio import outage: {} failed {} times in a row, the foundation is being told", outage.kind(), outage.consecutiveFailures());
            events.publishEvent(new BankImportOutageDetected(outage));
        });
        states.save(state);
    }

    private List<BankPayment> freshPayments(List<IncomingMovement> incoming, Instant now) {
        Set<BankTransactionId> seen = new HashSet<>(payments.findKnownTransactionIds(incoming.stream().map(IncomingMovement::id).toList()));
        return incoming.stream()
                .filter(movement -> seen.add(movement.id()))
                .map(movement -> BankPayment.incoming(BankPaymentId.newId(now), movement, now))
                .toList();
    }

    private void extendCoverage(BankStatement statement, ImportPlan plan, Instant now) {
        ImportPeriod requested = statement.requested();
        statement.reported()
                .filter(reported -> !requested.contains(reported))
                .ifPresent(reported -> log.warn("Fio reported {} for a request of {}", reported, requested));
        ImportPeriod covered = plan.needsUnlockedHistory() ? statement.reported().orElse(requested) : requested;
        BankImportState state = states.current();
        CoverageChange change = state.coverage().extendedBy(covered);
        change.gap().ifPresent(gap -> log.warn("Fio movements between {} and {} were not downloaded; unlock the history in Fio internet banking, "
                + "set FIO_HISTORY_FROM={} and restart the backend", gap.from(), gap.to(), gap.from()));
        state.succeeded(change.coverage(), now).ifPresent(recovery -> {
            log.info("Fio import recovered from the {} outage after {} failures", recovery.outageKind(), recovery.failures());
            events.publishEvent(new BankImportRecovered(recovery));
        });
        states.save(state);
    }
}
