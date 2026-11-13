package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.application.recovery.SecondFactorRecoveryPayments;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.importing.BankCalendar;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.CoverageChange;
import cz.novanadeje.app.donations.domain.importing.ImportAlertRepository;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportPlan;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import cz.novanadeje.app.shared.application.event.DonationsArrived;
import cz.novanadeje.app.shared.application.event.OperationalAlertRaised;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class BankStatementRecorder {

    static final int NEW_GIFT_BOOKING_DAYS = 7;

    private static final Logger log = LoggerFactory.getLogger(BankStatementRecorder.class);

    private final BankPaymentRepository payments;
    private final PaymentPairingService pairing;
    private final DonationRepository donations;
    private final BankImportStateRepository states;
    private final ImportAlertRepository alerts;
    private final SecondFactorRecoveryPayments recoveries;
    private final ApplicationEventPublisher events;

    public BankStatementRecorder(BankPaymentRepository payments, PaymentPairingService pairing, DonationRepository donations,
                                 BankImportStateRepository states, ImportAlertRepository alerts, SecondFactorRecoveryPayments recoveries,
                                 ApplicationEventPublisher events) {
        this.payments = payments;
        this.pairing = pairing;
        this.donations = donations;
        this.states = states;
        this.alerts = alerts;
        this.recoveries = recoveries;
        this.events = events;
    }

    @Transactional
    public ImportCounts record(BankStatement statement, ImportPlan plan, ImportTrigger trigger, Instant now) {
        List<BankPayment> fresh = freshPayments(statement.incoming(), now);
        payments.saveAll(fresh);
        recoveries.inspect(fresh, now);
        PairingOutcome outcome = pairing.pairUnpaired(now);
        announceArrivals(fresh, trigger, now);
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
            alerts.add(outage, at);
        });
        if (state.reportedOutage().isPresent()) {
            events.publishEvent(OperationalAlertRaised.opened(OperationalAlertRaised.Area.BANK_IMPORT, at));
        }
        states.save(state);
    }

    private void announceArrivals(List<BankPayment> fresh, ImportTrigger trigger, Instant now) {
        LocalDate bookedSince = LocalDate.ofInstant(now, BankCalendar.ZONE).minusDays(NEW_GIFT_BOOKING_DAYS);
        List<BankPaymentId> recent = fresh.stream().filter(payment -> !payment.bookedOn().isBefore(bookedSince)).map(BankPayment::id).toList();
        if (trigger == ImportTrigger.HISTORY || recent.isEmpty()) {
            return;
        }
        Set<UUID> donors = donations.donorsOfBankPayments(recent).stream()
                .map(DonorReference::value).collect(Collectors.toUnmodifiableSet());
        if (!donors.isEmpty()) {
            events.publishEvent(new DonationsArrived(donors, now));
        }
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
        change.gap().ifPresent(gap -> log.warn("Fio movements between {} and {} were not downloaded; unlock the history in Fio internet banking "
                + "and press Načíst starší platby on /sprava from {}", gap.from(), gap.to(), gap.from()));
        state.succeeded(change.coverage(), now).ifPresent(recovery -> {
            log.info("Fio import recovered from the {} outage after {} failures", recovery.outageKind(), recovery.failures());
            alerts.dropWaitingOutages(now);
            alerts.add(recovery, now);
        });
        statement.closingBalance().ifPresent(balance -> state.balanceRead(balance, now));
        events.publishEvent(OperationalAlertRaised.resolved(OperationalAlertRaised.Area.BANK_IMPORT, now));
        states.save(state);
    }
}
