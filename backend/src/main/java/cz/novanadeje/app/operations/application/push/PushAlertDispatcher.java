package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.application.alerts.OperationalAlertService;
import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Component
public class PushAlertDispatcher {

    static final List<Duration> RETRY_DELAYS = List.of(Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(15));

    private static final Logger log = LoggerFactory.getLogger(PushAlertDispatcher.class);

    private final PushSender sender;
    private final PushSubscriptionRepository subscriptions;
    private final OperationalAlertService alerts;
    private final PushRetryTimer timer;
    private final Clock clock;

    public PushAlertDispatcher(PushSender sender, PushSubscriptionRepository subscriptions, OperationalAlertService alerts, PushRetryTimer timer,
                               Clock clock) {
        this.sender = sender;
        this.subscriptions = subscriptions;
        this.alerts = alerts;
        this.timer = timer;
        this.clock = clock;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(OperationalAlertChanged changed) {
        attempt(changed, 1, Optional.empty());
    }

    void attempt(OperationalAlertChanged changed, int attempt, Optional<Set<PushSubscriptionId>> only) {
        PushMessageKind kind = PushMessageKind.of(changed.area(), changed.opened());
        try {
            if (!alerts.unchangedSince(changed.area(), changed.changes())) {
                return;
            }
            List<PushSubscription> recipients = subscriptions.findAllWithAlert(changed.area()).stream()
                    .filter(subscription -> only.map(ids -> ids.contains(subscription.id())).orElse(true)).toList();
            if (recipients.isEmpty()) {
                return;
            }
            PushAttempt sent = sender.attempt(recipients, new PushMessage(kind, changed.openCount()));
            log.info("Push alert {} attempt {}: {} delivered, {} failed, {} removed", kind, attempt, sent.report().delivered(),
                    sent.report().failed(), sent.report().removed());
            if (!sent.failed().isEmpty() && attempt <= RETRY_DELAYS.size()) {
                Set<PushSubscriptionId> failed = new HashSet<>(sent.failed());
                timer.at(clock.instant().plus(RETRY_DELAYS.get(attempt - 1)), () -> attempt(changed, attempt + 1, Optional.of(failed)));
            }
        } catch (RuntimeException failure) {
            log.warn("Push alert {} attempt {} could not be sent: {}", kind, attempt, failure.getClass().getSimpleName());
        }
    }
}
