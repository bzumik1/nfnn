package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.content.domain.project.ProjectOrderRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;

@Repository
class JpaProjectOrderRepository implements ProjectOrderRepository {

    private final ProjectOrderJpaRepository jpa;

    JpaProjectOrderRepository(ProjectOrderJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public ProjectOrder current() {
        return jpa.findById(ProjectOrderJpaEntity.SINGLETON_ID).map(ProjectOrderJpaEntity::order).orElse(ProjectOrder.DEFAULT);
    }

    @Override
    public void save(ProjectOrder order, Instant at) {
        jpa.save(ProjectOrderJpaEntity.of(order, at));
    }
}
