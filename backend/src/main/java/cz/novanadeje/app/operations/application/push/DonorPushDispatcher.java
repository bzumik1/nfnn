package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Component
public class DonorPushDispatcher {

    private static final Logger log = LoggerFactory.getLogger(DonorPushDispatcher.class);

    private final DonorPushSubscriptionRepository subscriptions;
    private final PushSender sender;
    private final SignedInDevices devices;
    private final PushRetryTimer timer;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public DonorPushDispatcher(DonorPushSubscriptionRepository subscriptions, PushSender sender, SignedInDevices devices, PushRetryTimer timer,
                               TransactionTemplate transactions, Clock clock) {
        this.subscriptions = subscriptions;
        this.sender = sender;
        this.devices = devices;
        this.timer = timer;
        this.transactions = transactions;
        this.clock = clock;
    }

    public void giftsArrived(Set<UUID> donorIds) {
        attempt(PushMessageKind.GIFT_ARRIVED, donorIds, 1, Optional.empty());
    }

    public void yearlyReceiptsReady(Set<UUID> donorIds) {
        attempt(PushMessageKind.YEARLY_RECEIPT_READY, donorIds, 1, Optional.empty());
    }

    void attempt(PushMessageKind kind, Set<UUID> donors, int attempt, Optional<Set<PushSubscriptionId>> only) {
        try {
            List<DonorPushSubscription> recipients = signedInOnly(wanting(kind, donors).stream()
                    .filter(subscription -> only.map(ids -> ids.contains(subscription.id())).orElse(true)).toList());
            if (recipients.isEmpty()) {
                return;
            }
            PushAttempt sent = sender.toDonors(recipients, new PushMessage(kind, 0));
            if (sent.failed().isEmpty()) {
                return;
            }
            if (attempt > PushAlertDispatcher.RETRY_DELAYS.size()) {
                log.warn("Push notification {} gave up on {} devices after {} attempts", kind, sent.failed().size(), attempt);
                return;
            }
            Set<PushSubscriptionId> failed = new HashSet<>(sent.failed());
            timer.at(clock.instant().plus(PushAlertDispatcher.RETRY_DELAYS.get(attempt - 1)), PushPace.PACED,
                    () -> attempt(kind, donors, attempt + 1, Optional.of(failed)));
        } catch (RuntimeException failure) {
            log.warn("Push notification {} attempt {} could not be sent: {}", kind, attempt, failure.getClass().getSimpleName());
        }
    }

    private List<DonorPushSubscription> wanting(PushMessageKind kind, Set<UUID> donors) {
        return switch (kind) {
            case GIFT_ARRIVED -> subscriptions.findWithGiftNotificationsOf(donors);
            case YEARLY_RECEIPT_READY -> subscriptions.findWithYearlyReceiptNotificationsOf(donors);
            case TEST, BANK_IMPORT_OUTAGE, BANK_IMPORT_RECOVERED, BACKUPS_OUTAGE, BACKUPS_RECOVERED, MAIL_OUTAGE, MAIL_RECOVERED, DONOR_TEST ->
                    throw new IllegalArgumentException("Push message kind " + kind + " is no donor notification of an event");
        };
    }

    private List<DonorPushSubscription> signedInOnly(List<DonorPushSubscription> found) {
        if (found.isEmpty()) {
            return found;
        }
        Set<UUID> signedIn = transactions.execute(status -> devices.signedInAmong(found.stream().map(DonorPushSubscription::deviceId).toList()));
        found.stream().filter(subscription -> !signedIn.contains(subscription.deviceId()))
                .forEach(leftover -> transactions.executeWithoutResult(status -> subscriptions.delete(leftover.id())));
        return found.stream().filter(subscription -> signedIn.contains(subscription.deviceId())).toList();
    }
}
