package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import cz.novanadeje.app.content.application.ContentVersions;
import cz.novanadeje.app.content.application.Versioned;
import cz.novanadeje.app.content.domain.ChangedMeanwhile;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.shared.infrastructure.json.RowVersionsFixture;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FoundersNoteServiceTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T08:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T08:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");

    private static final ContentVersions VERSIONS = new ContentVersions(RowVersionsFixture.canonical());

    @Mock
    private FoundersNoteRepository notes;
    @Mock
    private ApplicationEventPublisher events;

    private FoundersNoteService service() {
        return new FoundersNoteService(notes, VERSIONS, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given no note, when a note is written, then it is stored trimmed and the change is audited without a subject")
    void should_store_and_audit_the_note_when_written_given_no_note() {
        when(notes.find()).thenReturn(Optional.empty());

        Optional<String> text = service().change(ADMIN, Optional.of("  Děkujeme.  "), ExpectedVersion.none()).view();

        assertThat(text).contains("Děkujeme.");
        ArgumentCaptor<FoundersNote> saved = ArgumentCaptor.forClass(FoundersNote.class);
        verify(notes).save(saved.capture());
        assertThat(saved.getValue()).isEqualTo(new FoundersNote(Optional.of("Děkujeme."), NOW));
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("CHANGE_FOUNDERS_NOTE");
        assertThat(action.subjectId()).isEmpty();
        assertThat(action.details()).isEqualTo("Slovo zakladatelů upraveno");
    }

    @Test
    @DisplayName("Given a note, when it is emptied, then the empty note is stored and audited as removed")
    void should_audit_the_removal_when_emptied_given_a_note() {
        when(notes.find()).thenReturn(Optional.of(new FoundersNote(Optional.of("Děkujeme."), BEFORE)));

        Optional<String> text = service().change(ADMIN, Optional.of("   "), ExpectedVersion.none()).view();

        assertThat(text).isEmpty();
        verify(notes).save(FoundersNote.empty(NOW));
        assertThat(audited().details()).isEqualTo("Slovo zakladatelů odebráno");
    }

    @Test
    @DisplayName("Given a note, when the same text is written again, then nothing is stored or audited")
    void should_change_nothing_when_written_again_given_the_same_text() {
        when(notes.find()).thenReturn(Optional.of(new FoundersNote(Optional.of("Děkujeme."), BEFORE)));

        Optional<String> text = service().change(ADMIN, Optional.of("Děkujeme. "), ExpectedVersion.none()).view();

        assertThat(text).contains("Děkujeme.");
        verify(notes, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given no note stored, when the note is read, then it has no text")
    void should_have_no_text_when_read_given_nothing_stored() {
        when(notes.find()).thenReturn(Optional.empty());

        assertThat(service().current().view()).isEmpty();
    }

    @Test
    @DisplayName("Given a stored text, when it is read, then it carries the version of its stored fields, which the next change names")
    void should_carry_the_stored_version_when_read_given_a_stored_text() {
        FoundersNote stored = new FoundersNote(Optional.of("Děkujeme."), BEFORE);
        when(notes.find()).thenReturn(Optional.of(stored));

        Versioned<Optional<String>> current = service().current();

        assertThat(current.view()).contains("Děkujeme.");
        assertThat(current.version()).isEqualTo(VERSIONS.ofFoundersNote(Optional.of(stored))).matches("[0-9a-f]{16}");
    }

    @Test
    @DisplayName("Given a stored text, when a change names the version it was read at, then it is stored under the lock and answers the new version")
    void should_store_under_the_lock_and_answer_the_new_version_when_changed_from_the_current_version_given_a_stored_text() {
        FoundersNote stored = new FoundersNote(Optional.of("Děkujeme."), BEFORE);
        when(notes.find()).thenReturn(Optional.of(stored));

        Versioned<Optional<String>> changed = service().change(ADMIN, Optional.of("Nový text."), ExpectedVersion.of(VERSIONS.ofFoundersNote(Optional.of(stored))));

        var order = inOrder(notes);
        order.verify(notes).lockForChange();
        order.verify(notes).find();
        order.verify(notes).save(new FoundersNote(Optional.of("Nový text."), NOW));
        assertThat(changed.version()).isEqualTo(VERSIONS.ofFoundersNote(Optional.of(new FoundersNote(Optional.of("Nový text."), NOW))))
                .isNotEqualTo(VERSIONS.ofFoundersNote(Optional.of(stored)));
    }

    @Test
    @DisplayName("Given a text changed since it was read, when a change names the older version, then it is refused with the version and the stored fields now, and nothing is stored or audited")
    void should_refuse_with_the_current_version_and_fields_when_changed_from_an_older_version_given_a_text_changed_since() {
        FoundersNote stored = new FoundersNote(Optional.of("Děkujeme."), BEFORE);
        when(notes.find()).thenReturn(Optional.of(stored));

        assertThatThrownBy(() -> service().change(ADMIN, Optional.of("Nový text."), ExpectedVersion.of(VERSIONS.ofFoundersNote(Optional.empty()))))
                .isInstanceOfSatisfying(ChangedMeanwhile.class, refused -> {
                    assertThat(refused.code()).isEqualTo("content/changed-meanwhile");
                    assertThat(refused.extensions()).containsEntry("version", VERSIONS.ofFoundersNote(Optional.of(stored)))
                            .containsEntry("current", new ContentVersions.StoredPageText("Děkujeme.", BEFORE));
                });
        verify(notes, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given nothing stored yet, when a change names the version of the empty text, then it is stored")
    void should_store_when_changed_from_the_empty_version_given_nothing_stored() {
        when(notes.find()).thenReturn(Optional.empty());

        Versioned<Optional<String>> changed = service().change(ADMIN, Optional.of("Nový text."), ExpectedVersion.of(VERSIONS.ofFoundersNote(Optional.empty())));

        assertThat(changed.view()).contains("Nový text.");
        verify(notes).save(new FoundersNote(Optional.of("Nový text."), NOW));
    }

    private AdminActionPerformed audited() {
        ArgumentCaptor<AdminActionPerformed> action = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(action.capture());
        assertThat(action.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(action.getValue().performedAt()).isEqualTo(NOW);
        return action.getValue();
    }
}
