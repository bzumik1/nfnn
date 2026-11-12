package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Repository
class JpaFoundersNoteRepository implements FoundersNoteRepository {

    private final FoundersNoteJpaRepository jpa;
    private final EntityManager entityManager;

    JpaFoundersNoteRepository(FoundersNoteJpaRepository jpa, EntityManager entityManager) {
        this.jpa = jpa;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockForChange() {
        AdvisoryLock.PEOPLE_TEXT_CHANGES.acquireFor(entityManager);
    }

    @Override
    public Optional<FoundersNote> find() {
        return jpa.findById(FoundersNoteJpaEntity.SINGLETON_ID).map(FoundersNoteJpaEntity::toDomain);
    }

    @Override
    public void save(FoundersNote note) {
        jpa.save(FoundersNoteJpaEntity.fromDomain(note));
    }
}
