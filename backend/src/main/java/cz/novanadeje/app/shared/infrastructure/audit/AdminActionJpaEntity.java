package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.UuidV7;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "admin_action")
class AdminActionJpaEntity {

    static final int MAX_CLIENT_LENGTH = 253;

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

    @Column(name = "facts", columnDefinition = "jsonb")
    @ColumnTransformer(write = "cast(? as jsonb)")
    private String facts;

    @Column(name = "performed_at", nullable = false)
    private Instant performedAt;

    @Column(name = "client", length = MAX_CLIENT_LENGTH)
    private String client;

    protected AdminActionJpaEntity() {
    }

    static AdminActionJpaEntity of(AdminActionPerformed event, Optional<String> client) {
        AdminActionJpaEntity entity = new AdminActionJpaEntity();
        entity.id = UuidV7.generate(event.performedAt());
        entity.adminId = event.adminId();
        entity.action = event.action();
        entity.subjectId = event.subjectId().orElse(null);
        entity.details = event.details();
        entity.facts = event.facts().map(AdminActionFactsColumn::write).orElse(null);
        entity.performedAt = event.performedAt();
        entity.client = client.map(name -> name.length() > MAX_CLIENT_LENGTH ? name.substring(0, MAX_CLIENT_LENGTH) : name).orElse(null);
        return entity;
    }

    AdminActionEntry toEntry() {
        return new AdminActionEntry(id, adminId, action, Optional.ofNullable(subjectId), details, AdminActionFactsColumn.read(id, facts), performedAt,
                Optional.ofNullable(client));
    }
}
