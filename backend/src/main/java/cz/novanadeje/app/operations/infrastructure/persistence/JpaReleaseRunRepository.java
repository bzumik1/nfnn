package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.release.ReleaseRun;
import cz.novanadeje.app.operations.domain.release.ReleaseRunRepository;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
class JpaReleaseRunRepository implements ReleaseRunRepository {

    private final ReleaseRunJpaRepository jpa;
    private final EntityManager entityManager;

    JpaReleaseRunRepository(ReleaseRunJpaRepository jpa, EntityManager entityManager) {
        this.jpa = jpa;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockWrites() {
        AdvisoryLock.RELEASE_HISTORY.acquireFor(entityManager);
    }

    @Override
    public Optional<ReleaseRun> findNewest() {
        return findNewestFirst(1).stream().findFirst();
    }

    @Override
    public List<ReleaseRun> findNewestFirst(int limit) {
        return jpa.findAllByOrderByStartedAtDescIdDesc(Limit.of(limit)).stream().map(ReleaseRunJpaEntity::toDomain).toList();
    }

    @Override
    public void save(ReleaseRun run) {
        jpa.save(ReleaseRunJpaEntity.fromDomain(run));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public int deleteEndedBefore(Instant cutoff) {
        return jpa.deleteEndedBefore(cutoff);
    }
}
