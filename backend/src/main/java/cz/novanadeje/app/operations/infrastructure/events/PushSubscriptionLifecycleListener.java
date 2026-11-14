package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.push.PushSubscriptionLifecycle;
import cz.novanadeje.app.shared.application.event.AdministrationRevoked;
import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
import cz.novanadeje.app.shared.application.event.DonorErased;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class PushSubscriptionLifecycleListener {

    private final PushSubscriptionLifecycle lifecycle;

    PushSubscriptionLifecycleListener(PushSubscriptionLifecycle lifecycle) {
        this.lifecycle = lifecycle;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    void on(AdministrationRevoked revoked) {
        lifecycle.deleteAllOfFormerAdministrator(revoked.donorId());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    void on(DonorErased erased) {
        lifecycle.deleteAllOfErasedDonor(erased.donorId());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    void on(DeviceSignedOut signedOut) {
        lifecycle.deleteAllOfSignedOutDevice(signedOut.deviceId());
    }
}
