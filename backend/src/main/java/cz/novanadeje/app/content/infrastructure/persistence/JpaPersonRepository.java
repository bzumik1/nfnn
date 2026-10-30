package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
class JpaPersonRepository implements PersonRepository {

    private final PersonJpaRepository jpa;

    JpaPersonRepository(PersonJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public List<Person> findAllInOrder() {
        return jpa.findAllByOrderByPositionAscCreatedAtAsc().stream().map(PersonJpaEntity::toDomain).toList();
    }

    @Override
    public Optional<Person> findById(PersonId id) {
        return jpa.findById(id.value()).map(PersonJpaEntity::toDomain);
    }

    @Override
    public void save(Person person) {
        jpa.save(PersonJpaEntity.fromDomain(person));
    }

    @Override
    public void delete(PersonId id) {
        jpa.deleteById(id.value());
    }
}
