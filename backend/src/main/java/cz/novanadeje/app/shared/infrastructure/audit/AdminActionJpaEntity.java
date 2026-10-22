package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.UuidV7;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "admin_action")
class AdminActionJpaEntity {

    @Id
    private UUID id;

    @Column(name = "admin_id", nullable = false)
    private UUID adminId;

    @Column(name = "action", nullable = false, length = AdminActionPerformed.MAX_ACTION_LENGTH)
    private String action;

    @Column(name = "subject_id")
    private UUID subjectId;

    @Column(name = "details", nullable = false, length = AdminActionPerformed.MAX_DETAILS_LENGTH)
    private String details;

    @Column(name = "performed_at", nullable = false)
    private Instant performedAt;

    protected AdminActionJpaEntity() {
    }

    static AdminActionJpaEntity of(AdminActionPerformed event) {
        AdminActionJpaEntity entity = new AdminActionJpaEntity();
        entity.id = UuidV7.generate(event.performedAt());
        entity.adminId = event.adminId();
        entity.action = event.action();
        entity.subjectId = event.subjectId().orElse(null);
        entity.details = event.details();
        entity.performedAt = event.performedAt();
        return entity;
    }

    AdminActionEntry toEntry() {
        return new AdminActionEntry(id, adminId, action, Optional.ofNullable(subjectId), details, performedAt);
    }
}
