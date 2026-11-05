package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "operations_push_subscription")
class PushSubscriptionJpaEntity {

    @Id
    private UUID id;

    @Column(name = "administrator_id", nullable = false)
    private UUID administratorId;

    @Column(name = "device_id", nullable = false)
    private UUID deviceId;

    @Column(name = "endpoint", nullable = false, length = PushEndpoint.MAX_LENGTH)
    private String endpoint;

    @Column(name = "p256dh", nullable = false, length = PushClientKeys.MAX_LENGTH)
    private String p256dh;

    @Column(name = "auth", nullable = false, length = PushClientKeys.MAX_LENGTH)
    private String auth;

    @Column(name = "bank_import_alerts", nullable = false)
    private boolean bankImportAlerts;

    @Column(name = "backup_alerts", nullable = false)
    private boolean backupAlerts;

    @Column(name = "mail_alerts", nullable = false)
    private boolean mailAlerts;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_delivered_at")
    private Instant lastDeliveredAt;

    @Column(name = "failures_in_a_row", nullable = false)
    private int failuresInARow;

    protected PushSubscriptionJpaEntity() {
    }

    static PushSubscriptionJpaEntity fromDomain(PushSubscription subscription) {
        PushSubscriptionJpaEntity entity = new PushSubscriptionJpaEntity();
        entity.id = subscription.id().value();
        entity.administratorId = subscription.administratorId();
        entity.deviceId = subscription.deviceId();
        entity.endpoint = subscription.endpoint().value();
        entity.p256dh = subscription.keys().p256dh();
        entity.auth = subscription.keys().auth();
        entity.bankImportAlerts = subscription.alerts().bankImport();
        entity.backupAlerts = subscription.alerts().backups();
        entity.mailAlerts = subscription.alerts().mail();
        entity.createdAt = subscription.createdAt();
        entity.lastDeliveredAt = subscription.lastDeliveredAt().orElse(null);
        entity.failuresInARow = subscription.failuresInARow();
        return entity;
    }

    PushSubscription toDomain() {
        return new PushSubscription(new PushSubscriptionId(id), administratorId, deviceId, new PushEndpoint(endpoint), new PushClientKeys(p256dh, auth),
                new PushAlerts(bankImportAlerts, backupAlerts, mailAlerts), createdAt, Optional.ofNullable(lastDeliveredAt), failuresInARow);
    }
}
