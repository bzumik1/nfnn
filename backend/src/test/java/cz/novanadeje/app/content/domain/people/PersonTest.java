package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PersonTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T09:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T09:00:00Z");
    private static final MediaId PORTRAIT = MediaId.newId(BEFORE);
    private static final MediaId OTHER_PORTRAIT = MediaId.newId(NOW);
    private static final MediaId SIGNATURE = MediaId.newId(BEFORE.plusSeconds(1));

    @Test
    @DisplayName("Given new details, when a person is added, then they keep the details, the position and no web signature")
    void should_keep_the_details_and_no_signature_when_added_given_new_details() {
        Person person = Person.add(PersonId.newId(NOW), details(Optional.of(PORTRAIT)), 2, NOW);

        assertThat(person.details().name()).isEqualTo("Eva Vzorová");
        assertThat(person.position()).isEqualTo(2);
        assertThat(person.webSignature()).isEmpty();
        assertThat(person.createdAt()).isEqualTo(NOW);
        assertThat(person.updatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given details holding a line break, when a person is added or edited, then it is refused, and a person stored with one can be edited to clean details")
    void should_refuse_control_characters_when_added_or_edited_and_accept_clean_details_given_a_stored_line_break() {
        PersonDetails broken = new PersonDetails("Eva\nVzorová", Optional.empty(), true, Optional.empty(), true, Optional.empty(), PersonEmails.NONE);
        PersonDetails clean = new PersonDetails("Eva Vzorová", Optional.empty(), true, Optional.empty(), true, Optional.empty(), PersonEmails.NONE);
        Person stored = new Person(PersonId.newId(BEFORE), broken, 0, Optional.empty(), BEFORE, BEFORE);

        assertThatThrownBy(() -> Person.add(PersonId.newId(NOW), broken, 0, NOW)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Person.add(PersonId.newId(NOW), clean, 0, NOW).edit(broken, NOW)).isInstanceOf(IllegalArgumentException.class);
        assertThat(stored.edit(clean, NOW).details().name()).isEqualTo("Eva Vzorová");
    }

    @Test
    @DisplayName("Given a negative position, when a person is added, then it is refused")
    void should_refuse_the_person_when_added_given_a_negative_position() {
        assertThatThrownBy(() -> Person.add(PersonId.newId(NOW), details(Optional.empty()), -1, NOW))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a person with a portrait and a web signature, when the portrait is replaced, then the old portrait is the image they leave and the signature stays")
    void should_leave_the_old_portrait_when_replaced_given_a_portrait_and_a_signature() {
        Person current = Person.add(PersonId.newId(BEFORE), details(Optional.of(PORTRAIT)), 0, BEFORE).signWith(SIGNATURE, BEFORE);

        Person edited = current.edit(details(Optional.of(OTHER_PORTRAIT)), NOW);

        assertThat(current.imagesLeftBy(edited)).containsExactly(PORTRAIT);
        assertThat(edited.webSignature()).contains(SIGNATURE);
        assertThat(edited.updatedAt()).isEqualTo(NOW);
        assertThat(edited.createdAt()).isEqualTo(BEFORE);
    }

    @Test
    @DisplayName("Given a person with a web signature, when the signature is removed, then it is the image they leave, and setting the same one again leaves nothing")
    void should_leave_the_signature_when_removed_given_a_signature() {
        Person signed = Person.add(PersonId.newId(BEFORE), details(Optional.empty()), 0, BEFORE).signWith(SIGNATURE, BEFORE);

        assertThat(signed.imagesLeftBy(signed.withoutWebSignature(NOW))).containsExactly(SIGNATURE);
        assertThat(signed.imagesLeftBy(signed.signWith(SIGNATURE, NOW))).isEmpty();
    }

    @Test
    @DisplayName("Given a person with a portrait and a web signature, when their images are asked, then both come")
    void should_name_both_images_when_asked_given_a_portrait_and_a_signature() {
        Person signed = Person.add(PersonId.newId(BEFORE), details(Optional.of(PORTRAIT)), 0, BEFORE).signWith(SIGNATURE, BEFORE);

        assertThat(signed.images()).containsExactly(PORTRAIT, SIGNATURE);
    }

    @Test
    @DisplayName("Given a person, when they are placed at another position, then only the position and the time of the change differ")
    void should_change_only_the_position_when_placed_given_a_person() {
        Person person = Person.add(PersonId.newId(BEFORE), details(Optional.of(PORTRAIT)), 0, BEFORE);

        Person moved = person.placeAt(3, NOW);

        assertThat(moved.position()).isEqualTo(3);
        assertThat(moved.details()).isEqualTo(person.details());
        assertThat(moved.updatedAt()).isEqualTo(NOW);
    }

    private static PersonDetails details(Optional<MediaId> portrait) {
        return new PersonDetails("Eva Vzorová", Optional.of("Zakladatelka"), true, Optional.of("předsedkyně"), true, portrait, PersonEmails.NONE);
    }
}
