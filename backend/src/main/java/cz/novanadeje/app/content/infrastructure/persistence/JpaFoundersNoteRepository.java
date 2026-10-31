package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaFoundersNoteRepository implements FoundersNoteRepository {

    private final FoundersNoteJpaRepository jpa;

    JpaFoundersNoteRepository(FoundersNoteJpaRepository jpa) {
        this.jpa = jpa;
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
