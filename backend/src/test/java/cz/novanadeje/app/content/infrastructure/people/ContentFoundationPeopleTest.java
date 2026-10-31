package cz.novanadeje.app.content.infrastructure.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonDetails;
import cz.novanadeje.app.content.domain.people.PersonEmails;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import cz.novanadeje.app.shared.application.people.FoundationPerson;
import cz.novanadeje.app.shared.application.people.PrintPortrait;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ContentFoundationPeopleTest {

    private static final Instant AT = Instant.parse("2026-10-31T08:00:00Z");
    private static final MediaId PORTRAIT = MediaId.newId(AT);
    private static final PersonId WITH_PORTRAIT = PersonId.newId(AT);
    private static final PersonId WITHOUT_PORTRAIT = PersonId.newId(AT.plusSeconds(1));

    private final PersonRepository people = mock(PersonRepository.class);
    private final MediaImageRepository media = mock(MediaImageRepository.class);
    private final ContentFoundationPeople foundationPeople = new ContentFoundationPeople(people, media);

    @Test
    @DisplayName("Given people with and without a portrait, when one is looked up, then their name and whether they have a portrait come back, and nobody for an unknown id")
    void should_answer_name_and_portrait_when_looked_up_given_people() {
        givenPeople();

        assertThat(foundationPeople.find(WITH_PORTRAIT.value())).contains(new FoundationPerson(WITH_PORTRAIT.value(), "Petr Vzorový", true));
        assertThat(foundationPeople.find(WITHOUT_PORTRAIT.value())).contains(new FoundationPerson(WITHOUT_PORTRAIT.value(), "Eva Ukázková", false));
        assertThat(foundationPeople.find(PersonId.newId(AT.plusSeconds(9)).value())).isEmpty();
    }

    @Test
    @DisplayName("Given a person with a portrait in several sizes, when the portrait for print is asked for twice, then it is cut from the largest size once and the same bytes come back")
    void should_prepare_largest_variant_once_when_asked_twice_given_portrait() {
        givenPeople();
        when(media.findById(PORTRAIT)).thenReturn(Optional.of(new MediaImage(PORTRAIT, 1200, 800,
                List.of(variant(480, 320), variant(960, 640)), AT)));

        Optional<PrintPortrait> first = foundationPeople.printPortraitOf(WITH_PORTRAIT.value());
        Optional<PrintPortrait> second = foundationPeople.printPortraitOf(WITH_PORTRAIT.value());

        assertThat(first).isPresent();
        assertThat(second).isEqualTo(first);
        assertThat(decoded(first.get()).getWidth()).isEqualTo(PrintPortrait.SIDE);
        verify(media, times(1)).findById(PORTRAIT);
    }

    @Test
    @DisplayName("Given a person without a portrait, an unknown person or a portrait whose image is gone, when the portrait for print is asked for, then there is none")
    void should_answer_none_when_asked_given_no_portrait() {
        givenPeople();
        when(media.findById(PORTRAIT)).thenReturn(Optional.empty());

        assertThat(foundationPeople.printPortraitOf(WITHOUT_PORTRAIT.value())).isEmpty();
        assertThat(foundationPeople.printPortraitOf(PersonId.newId(AT.plusSeconds(9)).value())).isEmpty();
        assertThat(foundationPeople.printPortraitOf(WITH_PORTRAIT.value())).isEmpty();
    }

    private void givenPeople() {
        when(people.findById(WITH_PORTRAIT)).thenReturn(Optional.of(person(WITH_PORTRAIT, "Petr Vzorový", Optional.of(PORTRAIT))));
        when(people.findById(WITHOUT_PORTRAIT)).thenReturn(Optional.of(person(WITHOUT_PORTRAIT, "Eva Ukázková", Optional.empty())));
    }

    private static Person person(PersonId id, String name, Optional<MediaId> portrait) {
        return Person.add(id, new PersonDetails(name, Optional.of("předseda správní rady"), true, Optional.empty(), true, portrait,
                PersonEmails.NONE), 0, AT);
    }

    private static MediaVariant variant(int width, int height) {
        try {
            ByteArrayOutputStream webp = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "webp", webp);
            return new MediaVariant(width, height, webp.toByteArray());
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    private static BufferedImage decoded(PrintPortrait portrait) {
        try {
            return ImageIO.read(new ByteArrayInputStream(portrait.jpeg()));
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }
}
