package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.LockSupport;

@Component
public class DonorPushSender {

    static final int SENDS_AT_ONCE = 8;
    static final Duration GAP_BETWEEN_SENDS = Duration.ofMillis(50);

    private static final Logger log = LoggerFactory.getLogger(DonorPushSender.class);

    private final PushDelivery delivery;
    private final PushKeyService keys;
    private final DonorPushSubscriptionRepository subscriptions;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final Duration gap;
    private final Semaphore slots = new Semaphore(SENDS_AT_ONCE);

    @Autowired
    public DonorPushSender(PushDelivery delivery, PushKeyService keys, DonorPushSubscriptionRepository subscriptions, TransactionTemplate transactions,
                           Clock clock) {
        this(delivery, keys, subscriptions, transactions, clock, GAP_BETWEEN_SENDS);
    }

    DonorPushSender(PushDelivery delivery, PushKeyService keys, DonorPushSubscriptionRepository subscriptions, TransactionTemplate transactions,
                    Clock clock, Duration gap) {
        this.delivery = delivery;
        this.keys = keys;
        this.subscriptions = subscriptions;
        this.transactions = transactions;
        this.clock = clock;
        this.gap = gap;
    }

    public PushAttempt send(List<DonorPushSubscription> recipients, PushMessage message) {
        if (recipients.isEmpty()) {
            return PushAttempt.NONE;
        }
        VapidKeys vapid = keys.current();
        try (ExecutorService sends = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<PushOutcome>> outcomes = new ArrayList<>();
            for (DonorPushSubscription recipient : recipients) {
                if (!outcomes.isEmpty()) {
                    pause();
                }
                if (Thread.currentThread().isInterrupted() || !takeSlot()) {
                    break;
                }
                try {
                    outcomes.add(sends.submit(() -> {
                        try {
                            return recorded(recipient, deliver(recipient, message, vapid));
                        } finally {
                            slots.release();
                        }
                    }));
                } catch (RuntimeException rejected) {
                    slots.release();
                    break;
                }
            }
            PushDeliveryReport report = PushDeliveryReport.NONE;
            List<PushSubscriptionId> failed = new ArrayList<>();
            for (int index = 0; index < outcomes.size(); index++) {
                Optional<PushOutcome> outcome = outcomeOf(outcomes.get(index));
                if (outcome.isEmpty()) {
                    continue;
                }
                report = report.with(reportOf(outcome.get()));
                if (outcome.get() == PushOutcome.FAILED) {
                    failed.add(recipients.get(index).id());
                }
            }
            return new PushAttempt(report, failed);
        }
    }

    private PushOutcome deliver(DonorPushSubscription recipient, PushMessage message, VapidKeys vapid) {
        try {
            return delivery.deliver(recipient, message, vapid);
        } catch (RuntimeException failure) {
            return PushOutcome.FAILED;
        }
    }

    private PushOutcome recorded(DonorPushSubscription recipient, PushOutcome outcome) {
        try {
            return record(recipient, outcome);
        } catch (RuntimeException notRecorded) {
            return outcome;
        }
    }

    private PushOutcome record(DonorPushSubscription recipient, PushOutcome outcome) {
        switch (outcome) {
            case DELIVERED -> transactions.executeWithoutResult(status -> subscriptions.markDelivered(recipient.id(), clock.instant()));
            case GONE -> transactions.executeWithoutResult(status -> subscriptions.delete(recipient.id()));
            case FAILED -> transactions.execute(status -> subscriptions.markFailed(recipient.id()))
                    .filter(PushSubscription::failingLongEnoughToWarn)
                    .ifPresent(failures -> log.warn("Push subscription {} failed {} times in a row", recipient.id().value(), failures));
        }
        return outcome;
    }

    private void pause() {
        long until = System.nanoTime() + gap.toNanos();
        for (long left = gap.toNanos(); left > 0 && !Thread.currentThread().isInterrupted(); left = until - System.nanoTime()) {
            LockSupport.parkNanos(left);
        }
    }

    private boolean takeSlot() {
        try {
            slots.acquire();
            return true;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static Optional<PushOutcome> outcomeOf(Future<PushOutcome> outcome) {
        try {
            return Optional.of(outcome.get());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (ExecutionException failure) {
            return Optional.of(PushOutcome.FAILED);
        }
    }

    private static PushDeliveryReport reportOf(PushOutcome outcome) {
        return switch (outcome) {
            case DELIVERED -> new PushDeliveryReport(1, 0, 0);
            case GONE -> new PushDeliveryReport(0, 0, 1);
            case FAILED -> new PushDeliveryReport(0, 1, 0);
        };
    }
}
