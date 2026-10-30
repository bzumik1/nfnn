package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.media.MediaSize;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonDetails;
import cz.novanadeje.app.content.domain.people.PersonEmails;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.people.PersonImageInUse;
import cz.novanadeje.app.content.domain.people.PersonNotFound;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import cz.novanadeje.app.content.domain.people.TooManyPeople;
import cz.novanadeje.app.content.domain.people.WebSignatureInBrowserOnly;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PeopleAdminServiceTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T08:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T08:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");
    private static final MediaId PORTRAIT = MediaId.newId(BEFORE);
    private static final MediaId OTHER_PORTRAIT = MediaId.newId(NOW);
    private static final MediaId SIGNATURE = MediaId.newId(BEFORE.plusSeconds(1));
    private static final MediaSize SQUARE = new MediaSize(640, 640);
    private static final MediaSize INK = new MediaSize(600, 180);

    @Mock
    private PersonRepository people;
    @Mock
    private MediaImageRepository media;
    @Mock
    private ApplicationEventPublisher events;

    private PeopleAdminService service() {
        return new PeopleAdminService(people, media, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given two people, when a person is added with a portrait, then they come last with the portrait's size and the addition is audited without a subject")
    void should_add_the_person_last_and_audit_when_added_given_two_people() {
        when(people.findAllInOrderForUpdate()).thenReturn(List.of(stored(0, Optional.empty()), stored(1, Optional.empty())));
        when(media.findSize(PORTRAIT)).thenReturn(Optional.of(SQUARE));

        PersonView view = service().add(ADMIN, command(Optional.of(PORTRAIT)));

        ArgumentCaptor<Person> saved = ArgumentCaptor.forClass(Person.class);
        verify(people).save(saved.capture());
        assertThat(saved.getValue().position()).isEqualTo(2);
        assertThat(saved.getValue().createdAt()).isEqualTo(NOW);
        assertThat(view.name()).isEqualTo("Eva Vzorová");
        assertThat(view.portrait()).contains(new PersonImageView(PORTRAIT, 640, 640));
        assertThat(view.webSignature()).isEmpty();
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("ADD_PERSON");
        assertThat(action.subjectId()).isEmpty();
        assertThat(action.details()).isEqualTo("Osoba " + view.id() + " přidána mezi lidi fondu");
    }

    @Test
    @DisplayName("Given a person without e-mails, when a personal and a fund e-mail are set, then the view carries both and the audit names neither")
    void should_keep_the_emails_out_of_the_audit_when_updated_given_a_person_without_emails() {
        Person current = stored(0, Optional.empty());
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));

        PersonView view = service().update(ADMIN, current.id(), command(Optional.empty()), true);

        assertThat(view.personalEmail()).contains(new EmailAddress("eva@example.org"));
        assertThat(view.fundEmail()).contains(new EmailAddress("eva@nfnn.cz"));
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("UPDATE_PERSON");
        assertThat(action.details()).doesNotContain("@");
    }

    @Test
    @DisplayName("Given as many people as the site shows, when another is added, then it is refused and nothing is stored")
    void should_refuse_the_person_when_added_given_the_most_people() {
        when(people.findAllInOrderForUpdate()).thenReturn(IntStream.range(0, Person.MAX_PEOPLE).mapToObj(position -> stored(position, Optional.empty())).toList());

        assertThatThrownBy(() -> service().add(ADMIN, command(Optional.empty()))).isInstanceOf(TooManyPeople.class);
        verify(people, never()).save(any());
    }

    @Test
    @DisplayName("Given a portrait that was never uploaded, when a person is added with it, then it is refused and nothing is stored")
    void should_refuse_the_person_when_added_given_an_unknown_portrait() {
        when(people.findAllInOrderForUpdate()).thenReturn(List.of());
        when(media.findSize(PORTRAIT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().add(ADMIN, command(Optional.of(PORTRAIT)))).isInstanceOf(MediaNotFound.class);
        verify(people, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given a person with a portrait and a web signature, when the portrait is replaced, then the old portrait is deleted when unused, the signature stays and the change is audited")
    void should_delete_the_old_portrait_when_replaced_given_a_portrait_and_a_signature() {
        Person current = stored(0, Optional.of(PORTRAIT)).signWith(SIGNATURE, BEFORE);
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));
        when(media.findSize(OTHER_PORTRAIT)).thenReturn(Optional.of(SQUARE));
        when(media.findSize(SIGNATURE)).thenReturn(Optional.of(INK));

        PersonView view = service().update(ADMIN, current.id(), command(Optional.of(OTHER_PORTRAIT)), true);

        assertThat(view.portrait()).contains(new PersonImageView(OTHER_PORTRAIT, 640, 640));
        assertThat(view.webSignature()).contains(new PersonImageView(SIGNATURE, 600, 180));
        verify(media).deleteIfUnused(PORTRAIT);
        verify(media, never()).deleteIfUnused(SIGNATURE);
        assertThat(audited().details()).isEqualTo("Osoba " + current.id() + " v lidech fondu upravena");
    }

    @Test
    @DisplayName("Given no such person, when they are updated, then it is refused")
    void should_refuse_the_update_when_updated_given_no_such_person() {
        PersonId unknown = PersonId.newId(NOW);
        when(people.findByIdForUpdate(unknown)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().update(ADMIN, unknown, command(Optional.empty()), true)).isInstanceOf(PersonNotFound.class);
    }

    @Test
    @DisplayName("Given a person with a portrait and a web signature, when they are removed from a browser, then they go first and both images are deleted when unused")
    void should_remove_the_person_and_their_images_when_removed_from_a_browser_given_both_images() {
        Person current = stored(0, Optional.of(PORTRAIT)).signWith(SIGNATURE, BEFORE);
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));

        service().remove(ADMIN, current.id(), true);

        InOrder order = inOrder(people, media);
        order.verify(people).delete(current.id());
        order.verify(media).deleteIfUnused(PORTRAIT);
        order.verify(media).deleteIfUnused(SIGNATURE);
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("REMOVE_PERSON");
        assertThat(action.details()).isEqualTo("Osoba " + current.id() + " odebrána z lidí fondu");
    }

    @Test
    @DisplayName("Given a person with a web signature, when a connected application removes them, then it is refused and nothing changes")
    void should_refuse_the_removal_when_removed_by_a_connection_given_a_web_signature() {
        Person current = stored(0, Optional.of(PORTRAIT)).signWith(SIGNATURE, BEFORE);
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));

        assertThatThrownBy(() -> service().remove(ADMIN, current.id(), false)).isInstanceOf(WebSignatureInBrowserOnly.class);
        verify(people, never()).delete(any());
        verify(media, never()).deleteIfUnused(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given a person without a web signature, when a connected application removes them, then they go with their portrait")
    void should_remove_the_person_when_removed_by_a_connection_given_no_web_signature() {
        Person current = stored(0, Optional.of(PORTRAIT));
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));

        service().remove(ADMIN, current.id(), false);

        verify(people).delete(current.id());
        verify(media).deleteIfUnused(PORTRAIT);
    }

    @Test
    @DisplayName("Given three people, when they are ordered anew, then each is saved at its new position and the order is audited")
    void should_save_the_new_positions_when_ordered_given_three_people() {
        Person first = stored(0, Optional.empty());
        Person second = stored(1, Optional.empty());
        Person third = stored(2, Optional.empty());
        when(people.findAllInOrderForUpdate()).thenReturn(List.of(first, second, third));

        List<PersonView> ordered = service().order(ADMIN, List.of(third.id(), first.id(), second.id()));

        assertThat(ordered).extracting(PersonView::id).containsExactly(third.id(), first.id(), second.id());
        ArgumentCaptor<Person> saved = ArgumentCaptor.forClass(Person.class);
        verify(people, times(3)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(Person::position).containsExactly(0, 1, 2);
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("ORDER_PEOPLE");
        assertThat(action.details()).isEqualTo("Pořadí lidí fondu změněno");
    }

    @Test
    @DisplayName("Given a person, when a web signature is set, then it is stored with its size and audited with the image and the person")
    void should_store_the_signature_when_set_given_a_person() {
        Person current = stored(0, Optional.empty());
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));
        when(media.findSize(SIGNATURE)).thenReturn(Optional.of(INK));

        PersonView view = service().setWebSignature(ADMIN, current.id(), SIGNATURE);

        assertThat(view.webSignature()).contains(new PersonImageView(SIGNATURE, 600, 180));
        verify(media, never()).deleteIfUnused(any());
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("CHANGE_WEB_SIGNATURE");
        assertThat(action.details()).isEqualTo("Podpis " + SIGNATURE + " na webu u osoby " + current.id() + " nastaven");
    }

    @Test
    @DisplayName("Given a person with a web signature, when another is set or the signature is removed, then the old one is deleted when unused")
    void should_delete_the_old_signature_when_replaced_or_removed_given_a_signature() {
        Person signed = stored(0, Optional.empty()).signWith(SIGNATURE, BEFORE);
        when(people.findByIdForUpdate(signed.id())).thenReturn(Optional.of(signed));

        PersonView view = service().removeWebSignature(ADMIN, signed.id());

        assertThat(view.webSignature()).isEmpty();
        verify(media).deleteIfUnused(SIGNATURE);
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("REMOVE_WEB_SIGNATURE");
        assertThat(action.details()).isEqualTo("Podpis na webu u osoby " + signed.id() + " odebrán");
    }

    @Test
    @DisplayName("Given a person without a web signature, when the signature is removed, then nothing is stored, deleted or audited")
    void should_change_nothing_when_the_signature_is_removed_given_none() {
        Person current = stored(0, Optional.empty());
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));

        service().removeWebSignature(ADMIN, current.id());

        verify(people, never()).save(any());
        verify(media, never()).deleteIfUnused(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given an image that is a person's web signature, when a person is added or edited with it as the portrait, then it is refused and nothing is stored")
    void should_refuse_the_portrait_when_saved_given_an_image_that_is_a_web_signature() {
        Person current = stored(0, Optional.empty());
        when(people.findAllInOrderForUpdate()).thenReturn(List.of(current));
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));
        when(media.findSize(SIGNATURE)).thenReturn(Optional.of(INK));
        when(people.isAnyonesWebSignature(SIGNATURE)).thenReturn(true);

        assertThatThrownBy(() -> service().add(ADMIN, command(Optional.of(SIGNATURE)))).isInstanceOf(PersonImageInUse.class);
        assertThatThrownBy(() -> service().update(ADMIN, current.id(), command(Optional.of(SIGNATURE)), true))
                .isInstanceOf(PersonImageInUse.class);
        verify(people, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given an image that is a person's portrait, when it is set as a web signature, then it is refused and nothing is stored")
    void should_refuse_the_signature_when_set_given_an_image_that_is_a_portrait() {
        Person current = stored(0, Optional.of(PORTRAIT));
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));
        when(media.findSize(PORTRAIT)).thenReturn(Optional.of(SQUARE));
        when(people.isAnyonesPortrait(PORTRAIT)).thenReturn(true);

        assertThatThrownBy(() -> service().setWebSignature(ADMIN, current.id(), PORTRAIT)).isInstanceOf(PersonImageInUse.class);
        verify(people, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given a person with a web signature, when a connected application renames them, then it is refused, and a change that keeps the name passes")
    void should_refuse_the_rename_when_updated_outside_a_browser_given_a_web_signature() {
        Person current = stored(0, Optional.empty()).signWith(SIGNATURE, BEFORE);
        when(people.findByIdForUpdate(current.id())).thenReturn(Optional.of(current));
        lenient().when(media.findSize(SIGNATURE)).thenReturn(Optional.of(INK));

        assertThatThrownBy(() -> service().update(ADMIN, current.id(), command(Optional.empty()), false))
                .isInstanceOf(WebSignatureInBrowserOnly.class);
        verify(people, never()).save(any());

        PersonView view = service().update(ADMIN, current.id(), new PersonCommand("  Adam Vzor ", Optional.of("Zakladatel"), true,
                Optional.empty(), true, Optional.empty(), PersonEmails.NONE), false);

        assertThat(view.role()).contains("Zakladatel");
        assertThat(view.webSignature()).contains(new PersonImageView(SIGNATURE, 600, 180));
    }

    private AdminActionPerformed audited() {
        ArgumentCaptor<AdminActionPerformed> action = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(action.capture());
        assertThat(action.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(action.getValue().performedAt()).isEqualTo(NOW);
        return action.getValue();
    }

    private static Person stored(int position, Optional<MediaId> portrait) {
        return Person.add(PersonId.newId(BEFORE), new PersonDetails("Adam Vzor", Optional.empty(), true, Optional.empty(), true, portrait, PersonEmails.NONE), position,
                BEFORE);
    }

    private static PersonCommand command(Optional<MediaId> portrait) {
        return new PersonCommand("Eva Vzorová", Optional.of("Zakladatelka"), true, Optional.of("předsedkyně"), true, portrait,
                new PersonEmails(Optional.of(new EmailAddress("eva@example.org")), Optional.of(new EmailAddress("eva@nfnn.cz"))));
    }
}
