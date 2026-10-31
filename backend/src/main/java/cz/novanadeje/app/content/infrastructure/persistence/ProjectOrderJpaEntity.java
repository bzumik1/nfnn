package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.project.ProjectOrder;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "content_project_order")
class ProjectOrderJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "project_order", nullable = false, length = 32)
    private String order;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ProjectOrderJpaEntity() {
    }

    static ProjectOrderJpaEntity of(ProjectOrder order, Instant at) {
        ProjectOrderJpaEntity entity = new ProjectOrderJpaEntity();
        entity.id = SINGLETON_ID;
        entity.order = order.name();
        entity.updatedAt = at;
        return entity;
    }

    ProjectOrder order() {
        return ProjectOrder.valueOf(order);
    }
}
