package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FoundersNoteServiceTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T08:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T08:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");

    @Mock
    private FoundersNoteRepository notes;
    @Mock
    private ApplicationEventPublisher events;

    private FoundersNoteService service() {
        return new FoundersNoteService(notes, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given no note, when a note is written, then it is stored trimmed and the change is audited without a subject")
    void should_store_and_audit_the_note_when_written_given_no_note() {
        when(notes.find()).thenReturn(Optional.empty());

        Optional<String> text = service().change(ADMIN, Optional.of("  Děkujeme.  "));

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

        Optional<String> text = service().change(ADMIN, Optional.of("   "));

        assertThat(text).isEmpty();
        verify(notes).save(FoundersNote.empty(NOW));
        assertThat(audited().details()).isEqualTo("Slovo zakladatelů odebráno");
    }

    @Test
    @DisplayName("Given a note, when the same text is written again, then nothing is stored or audited")
    void should_change_nothing_when_written_again_given_the_same_text() {
        when(notes.find()).thenReturn(Optional.of(new FoundersNote(Optional.of("Děkujeme."), BEFORE)));

        Optional<String> text = service().change(ADMIN, Optional.of("Děkujeme. "));

        assertThat(text).contains("Děkujeme.");
        verify(notes, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given no note stored, when the note is read, then it has no text")
    void should_have_no_text_when_read_given_nothing_stored() {
        when(notes.find()).thenReturn(Optional.empty());

        assertThat(service().read()).isEmpty();
    }

    private AdminActionPerformed audited() {
        ArgumentCaptor<AdminActionPerformed> action = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(action.capture());
        assertThat(action.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(action.getValue().performedAt()).isEqualTo(NOW);
        return action.getValue();
    }
}
