package cz.novanadeje.app.content.domain.people;

import java.util.List;
import java.util.Optional;

public interface PersonRepository {

    List<Person> findAllInOrder();

    Optional<Person> findById(PersonId id);

    void save(Person person);

    void delete(PersonId id);
}
