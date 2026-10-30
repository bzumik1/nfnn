package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaSize;
import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonDetails;
import cz.novanadeje.app.content.domain.people.PersonEmails;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicPeopleServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-30T08:00:00Z");
    private static final MediaId PORTRAIT = MediaId.newId(NOW);
    private static final MediaId SIGNATURE = MediaId.newId(NOW.plusSeconds(1));
    private static final MediaId UNSHOWN_SIGNATURE = MediaId.newId(NOW.plusSeconds(2));

    @Mock
    private PersonRepository people;
    @Mock
    private FoundersNoteRepository notes;
    @Mock
    private MediaImageRepository media;

    private PublicPeopleService service() {
        return new PublicPeopleService(people, notes, media);
    }

    @Test
    @DisplayName("Given no people, when the public view is read, then there is none, so the site keeps its own block")
    void should_have_no_view_when_read_given_no_people() {
        when(people.findAllInOrder()).thenReturn(List.of());

        assertThat(service().read()).isEmpty();
    }

    @Test
    @DisplayName("Given featured people, board members and a note, when the public view is read, then the cards, the board line and the note with the featured signatures come in order")
    void should_carry_cards_board_and_note_when_read_given_people_and_a_note() {
        Person eva = person("Eva Vzorová", true, true, Optional.of("předsedkyně"), Optional.of(PORTRAIT), 0).signWith(SIGNATURE, NOW);
        Person adam = person("Adam Vzor", true, true, Optional.empty(), Optional.empty(), 1);
        Person hana = person("Hana Vzorová", false, true, Optional.empty(), Optional.empty(), 2).signWith(UNSHOWN_SIGNATURE, NOW);
        when(people.findAllInOrder()).thenReturn(List.of(eva, adam, hana));
        when(notes.find()).thenReturn(Optional.of(new FoundersNote(Optional.of("Děkujeme."), NOW)));
        when(media.findSize(PORTRAIT)).thenReturn(Optional.of(new MediaSize(640, 640)));
        when(media.findSize(SIGNATURE)).thenReturn(Optional.of(new MediaSize(600, 180)));

        PublicPeopleView view = service().read().orElseThrow();

        assertThat(view.featured()).containsExactly(
                new FeaturedPersonView("Eva Vzorová", Optional.of("Role"), Optional.of(new PersonImageView(PORTRAIT, 640, 640))),
                new FeaturedPersonView("Adam Vzor", Optional.of("Role"), Optional.empty()));
        assertThat(view.board()).containsExactly(
                new BoardMemberView("Eva Vzorová", Optional.of("předsedkyně")),
                new BoardMemberView("Adam Vzor", Optional.empty()),
                new BoardMemberView("Hana Vzorová", Optional.empty()));
        assertThat(view.note()).contains(new FoundersNoteView("Děkujeme.",
                List.of(new SignatureView(new PersonImageView(SIGNATURE, 600, 180), "Eva Vzorová"))));
    }

    @Test
    @DisplayName("Given people with signatures but no note, when the public view is read, then it has no note and so no signatures")
    void should_have_no_note_when_read_given_signatures_but_no_text() {
        Person eva = person("Eva Vzorová", true, false, Optional.empty(), Optional.empty(), 0).signWith(SIGNATURE, NOW);
        when(people.findAllInOrder()).thenReturn(List.of(eva));
        when(notes.find()).thenReturn(Optional.of(FoundersNote.empty(NOW)));
        lenient().when(media.findSize(SIGNATURE)).thenReturn(Optional.of(new MediaSize(600, 180)));

        PublicPeopleView view = service().read().orElseThrow();

        assertThat(view.note()).isEmpty();
        assertThat(view.board()).isEmpty();
    }

    private static Person person(String name, boolean featured, boolean onBoard, Optional<String> boardNote, Optional<MediaId> portrait, int position) {
        return Person.add(PersonId.newId(NOW), new PersonDetails(name, Optional.of("Role"), onBoard, boardNote, featured, portrait, PersonEmails.NONE), position, NOW);
    }
}
