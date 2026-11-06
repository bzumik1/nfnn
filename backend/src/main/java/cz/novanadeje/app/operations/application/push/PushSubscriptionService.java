package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.application.alerts.OperationalAlertService;
import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionLimitReached;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionNotFound;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class PushSubscriptionService {

    static final String SUBSCRIBE_ACTION = "SUBSCRIBE_PUSH";
    static final String REMOVE_ACTION = "REMOVE_PUSH_SUBSCRIPTION";
    static final String CHANGE_ALERTS_ACTION = "CHANGE_PUSH_ALERTS";

    private final PushSubscriptionRepository subscriptions;
    private final PushKeyService keys;
    private final PushSender sender;
    private final OperationalAlertService alerts;
    private final SignedInDevices devices;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public PushSubscriptionService(PushSubscriptionRepository subscriptions, PushKeyService keys, PushSender sender,
                                   OperationalAlertService alerts, SignedInDevices devices, ApplicationEventPublisher events, Clock clock) {
        this.subscriptions = subscriptions;
        this.keys = keys;
        this.sender = sender;
        this.alerts = alerts;
        this.devices = devices;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public PushView view(UUID administratorId, Optional<UUID> deviceId) {
        return new PushView(keys.current().publicKey(), deviceId.isPresent(), subscriptions.findAllOf(administratorId).stream()
                .map(subscription -> PushSubscriptionView.of(subscription, deviceId.filter(subscription.deviceId()::equals).isPresent())).toList(),
                alerts.open());
    }

    @Transactional
    public PushSubscriptionView subscribe(UUID administratorId, UUID deviceId, PushEndpoint endpoint, PushClientKeys clientKeys, PushAlerts alerts) {
        Instant now = clock.instant();
        devices.holdSignedIn(administratorId, deviceId);
        subscriptions.lockWrites();
        List<PushSubscription> displaced = subscriptions.findByEndpointOrDevice(endpoint, deviceId);
        subscriptions.deleteByEndpointOrDevice(endpoint, deviceId);
        if (subscriptions.findAllOf(administratorId).size() >= PushSubscription.MAX_PER_ADMINISTRATOR) {
            throw new PushSubscriptionLimitReached();
        }
        displaced.stream().filter(other -> !other.belongsTo(administratorId)).forEach(other -> events.publishEvent(new AdminActionPerformed(
                administratorId, REMOVE_ACTION, Optional.of(other.id().value()), "Upozornění přes push jiného správce vypnuta na zařízení ("
                + PushServiceNames.of(other.endpoint().service()) + "), protože si je ve stejném prohlížeči zapnul tento správce", now)));
        PushSubscription subscription = PushSubscription.subscribe(administratorId, deviceId, endpoint, clientKeys, alerts, now);
        subscriptions.save(subscription);
        events.publishEvent(new AdminActionPerformed(administratorId, SUBSCRIBE_ACTION, Optional.of(subscription.id().value()),
                "Upozornění přes push zapnuta na zařízení (" + PushServiceNames.of(endpoint.service()) + "), " + PushAlertNames.describe(alerts), now));
        return PushSubscriptionView.of(subscription);
    }

    @Transactional
    public void remove(UUID administratorId, PushSubscriptionId id) {
        PushSubscription subscription = ownedBy(administratorId, id);
        subscriptions.delete(id);
        events.publishEvent(new AdminActionPerformed(administratorId, REMOVE_ACTION, Optional.of(id.value()),
                "Upozornění přes push vypnuta na zařízení (" + PushServiceNames.of(subscription.endpoint().service()) + ")", clock.instant()));
    }

    @Transactional
    public PushSubscriptionView changeAlerts(UUID administratorId, PushSubscriptionId id, PushAlerts alerts, Optional<UUID> deviceId) {
        PushSubscription changed = ownedBy(administratorId, id).withAlerts(alerts);
        if (!subscriptions.changeAlerts(id, administratorId, alerts)) {
            throw new PushSubscriptionNotFound();
        }
        events.publishEvent(new AdminActionPerformed(administratorId, CHANGE_ALERTS_ACTION, Optional.of(id.value()),
                "Upozornění přes push na zařízení (" + PushServiceNames.of(changed.endpoint().service()) + "): " + PushAlertNames.describe(alerts),
                clock.instant()));
        return PushSubscriptionView.of(changed, deviceId.filter(changed.deviceId()::equals).isPresent());
    }

    public PushDeliveryReport sendTest(UUID administratorId) {
        return sender.send(subscriptions.findAllOf(administratorId), new PushMessage(PushMessageKind.TEST, Math.min(alerts.open().size(), PushMessage.MAX_COUNT)));
    }

    private PushSubscription ownedBy(UUID administratorId, PushSubscriptionId id) {
        return subscriptions.findById(id).filter(subscription -> subscription.belongsTo(administratorId))
                .orElseThrow(PushSubscriptionNotFound::new);
    }
}
