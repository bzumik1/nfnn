package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Component
public class PushSubscriptionLifecycle {

    private final PushSubscriptionRepository subscriptions;
    private final DonorPushSubscriptionRepository donorSubscriptions;

    public PushSubscriptionLifecycle(PushSubscriptionRepository subscriptions, DonorPushSubscriptionRepository donorSubscriptions) {
        this.subscriptions = subscriptions;
        this.donorSubscriptions = donorSubscriptions;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void deleteAllOfFormerAdministrator(UUID donorId) {
        subscriptions.deleteAllOf(donorId);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void deleteAllOfErasedDonor(UUID donorId) {
        subscriptions.deleteAllOf(donorId);
        donorSubscriptions.deleteAllOf(donorId);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void deleteAllOfSignedOutDevice(UUID deviceId) {
        subscriptions.deleteAllOfDevice(deviceId);
        donorSubscriptions.deleteAllOfDevice(deviceId);
    }
}
