package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.importing.ImportAlert;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportOutage;
import cz.novanadeje.app.donations.domain.importing.ImportRecovery;
import cz.novanadeje.app.donations.domain.importing.WaitingImportAlert;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "donation_import_alert")
class ImportAlertJpaEntity {

    enum Kind {
        OUTAGE,
        RECOVERY
    }

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 16)
    private Kind kind;

    @Enumerated(EnumType.STRING)
    @Column(name = "failure_kind", nullable = false, length = 32)
    private ImportFailureKind failureKind;

    @Column(name = "failures", nullable = false)
    private int failures;

    @Column(name = "last_succeeded_at")
    private Instant lastSucceededAt;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "outcome", length = 16)
    private String outcome;

    @Column(name = "settled_at")
    private Instant settledAt;

    protected ImportAlertJpaEntity() {
    }

    static ImportAlertJpaEntity waiting(UUID id, ImportAlert alert, Instant createdAt) {
        ImportAlertJpaEntity entity = new ImportAlertJpaEntity();
        entity.id = id;
        entity.createdAt = createdAt;
        switch (alert) {
            case ImportOutage outage -> {
                entity.kind = Kind.OUTAGE;
                entity.failureKind = outage.kind();
                entity.failures = outage.consecutiveFailures();
                entity.lastSucceededAt = outage.lastSucceededAt().orElse(null);
                entity.occurredAt = outage.detectedAt();
            }
            case ImportRecovery recovery -> {
                entity.kind = Kind.RECOVERY;
                entity.failureKind = recovery.outageKind();
                entity.failures = recovery.failures();
                entity.lastSucceededAt = recovery.lastSucceededBefore().orElse(null);
                entity.occurredAt = recovery.recoveredAt();
            }
        }
        return entity;
    }

    WaitingImportAlert toWaiting() {
        ImportAlert alert = switch (kind) {
            case OUTAGE -> new ImportOutage(failureKind, failures, Optional.ofNullable(lastSucceededAt), occurredAt);
            case RECOVERY -> new ImportRecovery(failureKind, failures, Optional.ofNullable(lastSucceededAt), occurredAt);
        };
        return new WaitingImportAlert(id, alert);
    }
}
