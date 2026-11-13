package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "operations_donor_push_subscription")
class DonorPushSubscriptionJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Column(name = "device_id", nullable = false)
    private UUID deviceId;

    @Column(name = "endpoint", nullable = false, length = PushEndpoint.MAX_LENGTH)
    private String endpoint;

    @Column(name = "p256dh", nullable = false, length = PushClientKeys.MAX_LENGTH)
    private String p256dh;

    @Column(name = "auth", nullable = false, length = PushClientKeys.MAX_LENGTH)
    private String auth;

    @Column(name = "gift_notifications", nullable = false)
    private boolean giftNotifications;

    @Column(name = "yearly_receipt_notifications", nullable = false)
    private boolean yearlyReceiptNotifications;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_delivered_at")
    private Instant lastDeliveredAt;

    @Column(name = "failures_in_a_row", nullable = false)
    private int failuresInARow;

    protected DonorPushSubscriptionJpaEntity() {
    }

    static DonorPushSubscriptionJpaEntity fromDomain(DonorPushSubscription subscription) {
        DonorPushSubscriptionJpaEntity entity = new DonorPushSubscriptionJpaEntity();
        entity.id = subscription.id().value();
        entity.donorId = subscription.donorId();
        entity.deviceId = subscription.deviceId();
        entity.endpoint = subscription.endpoint().value();
        entity.p256dh = subscription.keys().p256dh();
        entity.auth = subscription.keys().auth();
        entity.giftNotifications = subscription.notifications().gifts();
        entity.yearlyReceiptNotifications = subscription.notifications().yearlyReceipts();
        entity.createdAt = subscription.createdAt();
        entity.lastDeliveredAt = subscription.lastDeliveredAt().orElse(null);
        entity.failuresInARow = subscription.failuresInARow();
        return entity;
    }

    DonorPushSubscription toDomain() {
        return new DonorPushSubscription(new PushSubscriptionId(id), donorId, deviceId, new PushEndpoint(endpoint), new PushClientKeys(p256dh, auth),
                new DonorNotifications(giftNotifications, yearlyReceiptNotifications), createdAt, Optional.ofNullable(lastDeliveredAt), failuresInARow);
    }
}
