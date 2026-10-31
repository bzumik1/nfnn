package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.List;
import java.util.Optional;

public interface PersonRepository {

    List<Person> findAllInOrder();

    Optional<Person> findById(PersonId id);

    List<Person> findAllInOrderForUpdate();

    Optional<Person> findByIdForUpdate(PersonId id);

    boolean isAnyonesPortrait(MediaId image);

    boolean isAnyonesWebSignature(MediaId image);

    void save(Person person);

    void delete(PersonId id);
}
