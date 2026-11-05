package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import cz.novanadeje.app.shared.application.event.AdministrationRevoked;
import cz.novanadeje.app.shared.application.event.DonorErased;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class PushSubscriptionLifecycle {

    private final PushSubscriptionRepository subscriptions;

    public PushSubscriptionLifecycle(PushSubscriptionRepository subscriptions) {
        this.subscriptions = subscriptions;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void on(AdministrationRevoked revoked) {
        subscriptions.deleteAllOf(revoked.donorId());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void on(DonorErased erased) {
        subscriptions.deleteAllOf(erased.donorId());
    }
}
