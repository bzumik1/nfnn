package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonDetails;
import cz.novanadeje.app.content.domain.people.PersonEmails;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
class JpaPersonRepositoryTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    @Autowired
    private PersonRepository people;
    @Autowired
    private MediaImageRepository media;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given a person with every detail, a portrait and a web signature, when they are saved and read, then they come back as saved")
    void should_round_trip_when_saved_given_every_detail() {
        Person person = Person.add(PersonId.newId(BEFORE),
                        new PersonDetails("Eva Vzorová", Optional.of("Zakladatelka"), true, Optional.of("předsedkyně"), true, Optional.of(storedImage()),
                                new PersonEmails(Optional.of(new EmailAddress("eva@example.org")), Optional.of(new EmailAddress("eva@nfnn.cz")))),
                        0, BEFORE)
                .signWith(storedImage(), NOW);

        people.save(person);
        flushAndClear();

        assertThat(people.findById(person.id())).contains(person);
    }

    @Test
    @DisplayName("Given people saved out of order, when all are read, then they come by position and then by the time they were added")
    void should_read_by_position_when_all_are_read_given_people_saved_out_of_order() {
        Person third = person("Hana", 2, NOW);
        Person first = person("Eva", 0, NOW);
        Person secondEarlier = person("Adam", 1, BEFORE);
        Person secondLater = person("Jan", 1, NOW);
        List.of(third, secondLater, first, secondEarlier).forEach(people::save);
        flushAndClear();

        assertThat(people.findAllInOrder()).extracting(found -> found.details().name()).containsExactly("Eva", "Adam", "Jan", "Hana");
    }

    @Test
    @DisplayName("Given a saved person, when they are deleted, then they are gone and the others stay")
    void should_be_gone_when_deleted_given_a_saved_person() {
        Person kept = person("Eva", 0, NOW);
        Person removed = person("Adam", 1, NOW);
        people.save(kept);
        people.save(removed);
        flushAndClear();

        people.delete(removed.id());
        flushAndClear();

        assertThat(people.findById(removed.id())).isEmpty();
        assertThat(people.findAllInOrder()).extracting(Person::id).containsExactly(kept.id());
    }

    @Test
    @DisplayName("Given saved people, when they are read for an update, then they come in order and each row is locked for writing")
    void should_lock_the_rows_when_read_for_update_given_saved_people() {
        Person second = person("Adam", 1, NOW);
        Person first = person("Eva", 0, NOW);
        people.save(second);
        people.save(first);
        flushAndClear();

        assertThat(people.findByIdForUpdate(first.id())).contains(first);
        assertThat(lockOf(first)).isEqualTo(LockModeType.PESSIMISTIC_WRITE);
        entityManager.clear();
        assertThat(people.findAllInOrderForUpdate()).extracting(Person::id).containsExactly(first.id(), second.id());
        assertThat(lockOf(second)).isEqualTo(LockModeType.PESSIMISTIC_WRITE);
        assertThat(people.findByIdForUpdate(PersonId.newId(NOW))).isEmpty();
    }

    @Test
    @DisplayName("Given a person with a portrait and a web signature, when an image is checked, then only their portrait counts as a portrait and only their signature as a signature")
    void should_tell_portraits_from_signatures_when_checked_given_a_person_with_both() {
        MediaId portrait = storedImage();
        MediaId signature = storedImage();
        MediaId unused = storedImage();
        people.save(Person.add(PersonId.newId(BEFORE),
                new PersonDetails("Eva", Optional.empty(), true, Optional.empty(), true, Optional.of(portrait), PersonEmails.NONE), 0, BEFORE)
                .signWith(signature, NOW));
        flushAndClear();

        assertThat(people.isAnyonesPortrait(portrait)).isTrue();
        assertThat(people.isAnyonesPortrait(signature)).isFalse();
        assertThat(people.isAnyonesWebSignature(signature)).isTrue();
        assertThat(people.isAnyonesWebSignature(portrait)).isFalse();
        assertThat(people.isAnyonesPortrait(unused)).isFalse();
        assertThat(people.isAnyonesWebSignature(unused)).isFalse();
    }

    private LockModeType lockOf(Person person) {
        return entityManager.getLockMode(entityManager.find(PersonJpaEntity.class, person.id().value()));
    }

    private static Person person(String name, int position, Instant at) {
        return Person.add(PersonId.newId(at), new PersonDetails(name, Optional.empty(), true, Optional.empty(), false, Optional.empty(), PersonEmails.NONE), position, at);
    }

    private MediaId storedImage() {
        MediaImage image = new MediaImage(MediaId.newId(NOW), 640, 640, List.of(new MediaVariant(480, 480, "RIFF-webp-480".getBytes())), NOW);
        media.save(image);
        return image.id();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
