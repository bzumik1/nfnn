package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.settings.SetupStateRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;

@Repository
class JpaSetupStateRepository implements SetupStateRepository {

    private final SetupStateJpaRepository jpa;

    JpaSetupStateRepository(SetupStateJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public boolean isCompleted() {
        return jpa.existsById(SetupStateJpaEntity.SINGLETON_ID);
    }

    @Override
    public void markCompleted(Instant completedAt) {
        jpa.saveAndFlush(SetupStateJpaEntity.completedAt(completedAt));
    }
}
