package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushDeviceKeepsNothing;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionLimitReached;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionNotFound;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class DonorPushService {

    private static final PushMessage TEST = new PushMessage(PushMessageKind.DONOR_TEST, 0);

    private final DonorPushSubscriptionRepository subscriptions;
    private final PushKeyService keys;
    private final DonorPushSender sender;
    private final SignedInDevices devices;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public DonorPushService(DonorPushSubscriptionRepository subscriptions, PushKeyService keys, DonorPushSender sender, SignedInDevices devices,
                            TransactionTemplate transactions, Clock clock) {
        this.subscriptions = subscriptions;
        this.keys = keys;
        this.sender = sender;
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
        return sender.send(List.of(subscription), TEST).report();
    }
}
