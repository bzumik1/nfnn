package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import cz.novanadeje.app.content.domain.people.PeopleFootnoteRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaPeopleFootnoteRepository implements PeopleFootnoteRepository {

    private final PeopleFootnoteJpaRepository jpa;

    JpaPeopleFootnoteRepository(PeopleFootnoteJpaRepository jpa) {
        this.jpa = jpa;
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
