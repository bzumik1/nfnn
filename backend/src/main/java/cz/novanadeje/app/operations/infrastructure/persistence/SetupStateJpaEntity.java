package cz.novanadeje.app.operations.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "operations_setup")
public class SetupStateJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "completed_at", nullable = false)
    private Instant completedAt;

    protected SetupStateJpaEntity() {
    }

    static SetupStateJpaEntity completedAt(Instant completedAt) {
        SetupStateJpaEntity entity = new SetupStateJpaEntity();
        entity.id = SINGLETON_ID;
        entity.completedAt = completedAt;
        return entity;
    }
}
