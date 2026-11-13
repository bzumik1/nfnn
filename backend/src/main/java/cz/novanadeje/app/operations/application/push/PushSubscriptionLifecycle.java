package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import cz.novanadeje.app.shared.application.event.AdministrationRevoked;
import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
import cz.novanadeje.app.shared.application.event.DonorErased;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class PushSubscriptionLifecycle {

    private final PushSubscriptionRepository subscriptions;
    private final DonorPushSubscriptionRepository donorSubscriptions;

    public PushSubscriptionLifecycle(PushSubscriptionRepository subscriptions, DonorPushSubscriptionRepository donorSubscriptions) {
        this.subscriptions = subscriptions;
        this.donorSubscriptions = donorSubscriptions;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void on(AdministrationRevoked revoked) {
        subscriptions.deleteAllOf(revoked.donorId());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void on(DonorErased erased) {
        subscriptions.deleteAllOf(erased.donorId());
        donorSubscriptions.deleteAllOf(erased.donorId());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void on(DeviceSignedOut signedOut) {
        subscriptions.deleteAllOfDevice(signedOut.deviceId());
        donorSubscriptions.deleteAllOfDevice(signedOut.deviceId());
    }
}
