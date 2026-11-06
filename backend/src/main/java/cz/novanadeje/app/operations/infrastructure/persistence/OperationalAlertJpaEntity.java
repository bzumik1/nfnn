package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlert;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;

@Entity
@Table(name = "operations_alert")
class OperationalAlertJpaEntity {

    static final int MAX_AREA_LENGTH = 20;

    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "area", length = MAX_AREA_LENGTH)
    private MonitoredArea area;

    @Column(name = "open_since")
    private Instant openSince;

    @Column(name = "changes", nullable = false)
    private long changes;

    protected OperationalAlertJpaEntity() {
    }

    static OperationalAlertJpaEntity fromDomain(OperationalAlert alert) {
        OperationalAlertJpaEntity entity = new OperationalAlertJpaEntity();
        entity.area = alert.area();
        entity.openSince = alert.openSince().orElse(null);
        entity.changes = alert.changes();
        return entity;
    }

    OperationalAlert toDomain() {
        return new OperationalAlert(area, Optional.ofNullable(openSince), changes);
    }
}
