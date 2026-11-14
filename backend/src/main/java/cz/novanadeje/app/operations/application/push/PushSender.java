package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushRecipient;
import cz.novanadeje.app.operations.domain.push.PushRecipientRepository;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public class PushSender {

    private static final Logger log = LoggerFactory.getLogger(PushSender.class);

    private final PushDelivery delivery;
    private final PushKeyService keys;
    private final PushSubscriptionRepository administrators;
    private final DonorPushSubscriptionRepository donors;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public PushSender(PushDelivery delivery, PushKeyService keys, PushSubscriptionRepository administrators, DonorPushSubscriptionRepository donors,
                      TransactionTemplate transactions, Clock clock) {
        this.delivery = delivery;
        this.keys = keys;
        this.administrators = administrators;
        this.donors = donors;
        this.transactions = transactions;
        this.clock = clock;
    }

    public PushAttempt toAdministrators(List<PushSubscription> recipients, PushMessage message) {
        return send(recipients, message, PushPace.AT_ONCE);
    }

    public PushAttempt toDonors(List<DonorPushSubscription> recipients, PushMessage message) {
        return send(recipients, message, PushPace.PACED);
    }

    private PushAttempt send(List<? extends PushRecipient> recipients, PushMessage message, PushPace pace) {
        if (recipients.isEmpty()) {
            return PushAttempt.NONE;
        }
        Map<PushSubscriptionId, PushOutcome> outcomes = delivery.deliver(recipients, message, keys.current(), pace);
        PushDeliveryReport report = PushDeliveryReport.NONE;
        List<PushSubscriptionId> failed = new ArrayList<>();
        for (PushRecipient recipient : recipients) {
            if (!outcomes.containsKey(recipient.id())) {
                continue;
            }
            PushOutcome outcome = recorded(recipient, outcomes.get(recipient.id()));
            report = report.with(PushDeliveryReport.of(outcome));
            if (outcome == PushOutcome.FAILED) {
                failed.add(recipient.id());
            }
        }
        return new PushAttempt(report, failed);
    }

    private PushOutcome recorded(PushRecipient recipient, PushOutcome outcome) {
        try {
            return record(recipient, outcome);
        } catch (RuntimeException notRecorded) {
            return outcome;
        }
    }

    private PushOutcome record(PushRecipient recipient, PushOutcome outcome) {
        PushRecipientRepository rows = rowsOf(recipient);
        switch (outcome) {
            case DELIVERED -> transactions.executeWithoutResult(status -> rows.markDelivered(recipient.id(), clock.instant()));
            case GONE -> transactions.executeWithoutResult(status -> rows.delete(recipient.id()));
            case FAILED -> transactions.execute(status -> rows.markFailed(recipient.id()))
                    .filter(PushSubscription::failingLongEnoughToWarn)
                    .ifPresent(failures -> log.warn("Push subscription {} failed {} times in a row", recipient.id().value(), failures));
        }
        return outcome;
    }

    private PushRecipientRepository rowsOf(PushRecipient recipient) {
        return switch (recipient) {
            case PushSubscription _ -> administrators;
            case DonorPushSubscription _ -> donors;
        };
    }
}
