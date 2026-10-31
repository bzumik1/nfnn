package cz.novanadeje.app.content.domain.people;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PeopleOrderTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T09:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T09:00:00Z");

    private final Person first = person("Eva", 0);
    private final Person second = person("Adam", 1);
    private final Person third = person("Hana", 2);

    @Test
    @DisplayName("Given three people, when they are ordered anew, then each takes the position of its place in the new order")
    void should_number_the_people_by_the_new_order_when_ordered_given_three_people() {
        List<Person> ordered = PeopleOrder.apply(List.of(first, second, third), List.of(third.id(), first.id(), second.id()), NOW);

        assertThat(ordered).extracting(Person::id).containsExactly(third.id(), first.id(), second.id());
        assertThat(ordered).extracting(Person::position).containsExactly(0, 1, 2);
        assertThat(ordered).extracting(Person::updatedAt).containsOnly(NOW);
    }

    @Test
    @DisplayName("Given three people, when the order leaves one out, repeats one or names a stranger, then it is refused")
    void should_refuse_the_order_when_it_does_not_name_each_person_once_given_three_people() {
        List<Person> people = List.of(first, second, third);

        assertThatThrownBy(() -> PeopleOrder.apply(people, List.of(first.id(), second.id()), NOW)).isInstanceOf(PeopleOrderMismatch.class);
        assertThatThrownBy(() -> PeopleOrder.apply(people, List.of(first.id(), second.id(), second.id()), NOW))
                .isInstanceOf(PeopleOrderMismatch.class);
        assertThatThrownBy(() -> PeopleOrder.apply(people, List.of(first.id(), second.id(), PersonId.newId(NOW)), NOW))
                .isInstanceOf(PeopleOrderMismatch.class);
    }

    private static Person person(String name, int position) {
        return Person.add(PersonId.newId(BEFORE.plusSeconds(position)),
                new PersonDetails(name, Optional.empty(), true, Optional.empty(), false, Optional.empty(), PersonEmails.NONE), position, BEFORE);
    }
}
