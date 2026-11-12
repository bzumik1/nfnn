package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushDeviceKeepsNothing;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionLimitReached;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionNotFound;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class DonorPushService {

    private static final Logger log = LoggerFactory.getLogger(DonorPushService.class);
    private static final PushMessage TEST = new PushMessage(PushMessageKind.DONOR_TEST, 0);

    private final DonorPushSubscriptionRepository subscriptions;
    private final PushKeyService keys;
    private final PushDelivery delivery;
    private final SignedInDevices devices;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public DonorPushService(DonorPushSubscriptionRepository subscriptions, PushKeyService keys, PushDelivery delivery, SignedInDevices devices,
                            TransactionTemplate transactions, Clock clock) {
        this.subscriptions = subscriptions;
        this.keys = keys;
        this.delivery = delivery;
        this.devices = devices;
        this.transactions = transactions;
        this.clock = clock;
    }

    @Transactional
    public DonorPushView view(UUID donorId, Optional<UUID> deviceId) {
        List<DonorPushSubscription> all = subscriptions.findAllOf(donorId);
        Optional<DonorPushDeviceView> current = deviceId.flatMap(device -> all.stream().filter(subscription -> subscription.deviceId().equals(device))
                .findFirst()).map(DonorPushDeviceView::of);
        return new DonorPushView(keys.current().publicKey(), deviceId.isPresent(), current, all.stream().map(DonorPushSubscription::deviceId).toList());
    }

    @Transactional
    public DonorPushDeviceView subscribe(UUID donorId, UUID deviceId, PushEndpoint endpoint, PushClientKeys clientKeys,
                                         DonorNotifications notifications) {
        if (devices.holdSignedIn(donorId, deviceId).keepsNothing()) {
            throw new PushDeviceKeepsNothing();
        }
        subscriptions.lockWrites();
        subscriptions.deleteByEndpointOrDevice(endpoint, deviceId);
        if (subscriptions.findAllOf(donorId).size() >= DonorPushSubscription.MAX_PER_DONOR) {
            throw new PushSubscriptionLimitReached();
        }
        DonorPushSubscription subscription = DonorPushSubscription.subscribe(donorId, deviceId, endpoint, clientKeys, notifications, clock.instant());
        subscriptions.save(subscription);
        return DonorPushDeviceView.of(subscription);
    }

    @Transactional
    public DonorPushDeviceView changeNotifications(UUID donorId, UUID deviceId, DonorNotifications notifications) {
        DonorPushSubscription changed = subscriptions.findOfDevice(donorId, deviceId).orElseThrow(PushSubscriptionNotFound::new)
                .withNotifications(notifications);
        if (!subscriptions.changeNotifications(donorId, deviceId, notifications)) {
            throw new PushSubscriptionNotFound();
        }
        return DonorPushDeviceView.of(changed);
    }

    @Transactional
    public void remove(UUID donorId, UUID deviceId) {
        subscriptions.findOfDevice(donorId, deviceId).ifPresent(subscription -> subscriptions.delete(subscription.id()));
    }

    public PushDeliveryReport sendTest(UUID donorId, UUID deviceId) {
        DonorPushSubscription subscription = transactions.execute(status -> subscriptions.findOfDevice(donorId, deviceId))
                .orElseThrow(PushSubscriptionNotFound::new);
        PushOutcome outcome = deliver(subscription, keys.current());
        record(subscription, outcome);
        return switch (outcome) {
            case DELIVERED -> new PushDeliveryReport(1, 0, 0);
            case FAILED -> new PushDeliveryReport(0, 1, 0);
            case GONE -> new PushDeliveryReport(0, 0, 1);
        };
    }

    private PushOutcome deliver(DonorPushSubscription subscription, VapidKeys vapid) {
        try {
            return delivery.deliver(subscription, TEST, vapid);
        } catch (RuntimeException failure) {
            return PushOutcome.FAILED;
        }
    }

    private void record(DonorPushSubscription subscription, PushOutcome outcome) {
        try {
            switch (outcome) {
                case DELIVERED -> transactions.executeWithoutResult(status -> subscriptions.markDelivered(subscription.id(), clock.instant()));
                case GONE -> transactions.executeWithoutResult(status -> subscriptions.delete(subscription.id()));
                case FAILED -> transactions.execute(status -> subscriptions.markFailed(subscription.id()))
                        .filter(PushSubscription::failingLongEnoughToWarn)
                        .ifPresent(failures -> log.warn("Push subscription {} failed {} times in a row", subscription.id().value(), failures));
            }
        } catch (RuntimeException notRecorded) {
            return;
        }
    }
}
