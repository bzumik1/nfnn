package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@Component
public class PushSender {

    private static final Logger log = LoggerFactory.getLogger(PushSender.class);

    private final PushDelivery delivery;
    private final PushKeyService keys;
    private final PushSubscriptionRepository subscriptions;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public PushSender(PushDelivery delivery, PushKeyService keys, PushSubscriptionRepository subscriptions, TransactionTemplate transactions,
                      Clock clock) {
        this.delivery = delivery;
        this.keys = keys;
        this.subscriptions = subscriptions;
        this.transactions = transactions;
        this.clock = clock;
    }

    public PushDeliveryReport send(List<PushSubscription> recipients, PushMessage message) {
        return attempt(recipients, message).report();
    }

    public PushAttempt attempt(List<PushSubscription> recipients, PushMessage message) {
        if (recipients.isEmpty()) {
            return PushAttempt.NONE;
        }
        VapidKeys vapid = keys.current();
        try (ExecutorService sends = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<PushOutcome>> outcomes = recipients.stream()
                    .map(subscription -> sends.submit(() -> record(subscription, deliver(subscription, message, vapid)))).toList();
            PushDeliveryReport report = PushDeliveryReport.NONE;
            List<PushSubscriptionId> failed = new ArrayList<>();
            for (int index = 0; index < recipients.size(); index++) {
                PushOutcome outcome = outcomeOf(outcomes.get(index));
                report = report.with(reportOf(outcome));
                if (outcome == PushOutcome.FAILED) {
                    failed.add(recipients.get(index).id());
                }
            }
            return new PushAttempt(report, failed);
        }
    }

    private PushOutcome deliver(PushSubscription subscription, PushMessage message, VapidKeys vapid) {
        try {
            return delivery.deliver(subscription, message, vapid);
        } catch (RuntimeException failure) {
            return PushOutcome.FAILED;
        }
    }

    private static PushOutcome outcomeOf(Future<PushOutcome> outcome) {
        try {
            return outcome.get();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return PushOutcome.FAILED;
        } catch (ExecutionException failure) {
            return PushOutcome.FAILED;
        }
    }

    private static PushDeliveryReport reportOf(PushOutcome outcome) {
        return switch (outcome) {
            case DELIVERED -> new PushDeliveryReport(1, 0, 0);
            case GONE -> new PushDeliveryReport(0, 0, 1);
            case FAILED -> new PushDeliveryReport(0, 1, 0);
        };
    }

    private PushOutcome record(PushSubscription subscription, PushOutcome outcome) {
        switch (outcome) {
            case DELIVERED -> transactions.executeWithoutResult(status -> subscriptions.markDelivered(subscription.id(), clock.instant()));
            case GONE -> transactions.executeWithoutResult(status -> subscriptions.delete(subscription.id()));
            case FAILED -> transactions.execute(status -> subscriptions.markFailed(subscription.id()))
                    .filter(PushSubscription::failingLongEnoughToWarn)
                    .ifPresent(failures -> log.warn("Push subscription {} failed {} times in a row", subscription.id().value(), failures));
        }
        return outcome;
    }
}
