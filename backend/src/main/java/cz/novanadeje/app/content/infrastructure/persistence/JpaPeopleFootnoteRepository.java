package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import cz.novanadeje.app.content.domain.people.PeopleFootnoteRepository;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Repository
class JpaPeopleFootnoteRepository implements PeopleFootnoteRepository {

    private final PeopleFootnoteJpaRepository jpa;
    private final EntityManager entityManager;

    JpaPeopleFootnoteRepository(PeopleFootnoteJpaRepository jpa, EntityManager entityManager) {
        this.jpa = jpa;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockForChange() {
        AdvisoryLock.PEOPLE_TEXT_CHANGES.acquireFor(entityManager);
    }

    @Override
    public Optional<PeopleFootnote> find() {
        return jpa.findById(PeopleFootnoteJpaEntity.SINGLETON_ID).map(PeopleFootnoteJpaEntity::toDomain);
    }

    @Override
    public void save(PeopleFootnote footnote) {
        jpa.save(PeopleFootnoteJpaEntity.fromDomain(footnote));
    }
}
