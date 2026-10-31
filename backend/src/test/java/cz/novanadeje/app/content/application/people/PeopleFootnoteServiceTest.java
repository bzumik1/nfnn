package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import cz.novanadeje.app.content.domain.people.PeopleFootnoteRepository;
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
class PeopleFootnoteServiceTest {

    private static final Instant BEFORE = Instant.parse("2026-10-30T08:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-31T08:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");

    @Mock
    private PeopleFootnoteRepository footnotes;
    @Mock
    private ApplicationEventPublisher events;

    private PeopleFootnoteService service() {
        return new PeopleFootnoteService(footnotes, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given no footnote, when a footnote is written, then it is stored as one line and the change is audited without a subject")
    void should_store_and_audit_the_footnote_when_written_given_no_footnote() {
        when(footnotes.find()).thenReturn(Optional.empty());

        Optional<String> text = service().change(ADMIN, Optional.of("  Web zajišťuje\nPetr Vzor.  "));

        assertThat(text).contains("Web zajišťuje Petr Vzor.");
        ArgumentCaptor<PeopleFootnote> saved = ArgumentCaptor.forClass(PeopleFootnote.class);
        verify(footnotes).save(saved.capture());
        assertThat(saved.getValue()).isEqualTo(new PeopleFootnote(Optional.of("Web zajišťuje Petr Vzor."), NOW));
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("CHANGE_PEOPLE_FOOTNOTE");
        assertThat(action.subjectId()).isEmpty();
        assertThat(action.details()).isEqualTo("Řádek pod správní radou upraven");
    }

    @Test
    @DisplayName("Given a footnote, when it is emptied, then the empty footnote is stored and audited as removed")
    void should_audit_the_removal_when_emptied_given_a_footnote() {
        when(footnotes.find()).thenReturn(Optional.of(new PeopleFootnote(Optional.of("Web zajišťuje Petr Vzor."), BEFORE)));

        Optional<String> text = service().change(ADMIN, Optional.empty());

        assertThat(text).isEmpty();
        verify(footnotes).save(PeopleFootnote.empty(NOW));
        assertThat(audited().details()).isEqualTo("Řádek pod správní radou odebrán");
    }

    @Test
    @DisplayName("Given a footnote, when the same text is written again, then nothing is stored or audited")
    void should_change_nothing_when_written_again_given_the_same_text() {
        when(footnotes.find()).thenReturn(Optional.of(new PeopleFootnote(Optional.of("Web zajišťuje Petr Vzor."), BEFORE)));

        Optional<String> text = service().change(ADMIN, Optional.of("Web zajišťuje  Petr Vzor. "));

        assertThat(text).contains("Web zajišťuje Petr Vzor.");
        verify(footnotes, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given no footnote stored, when the footnote is read, then it has no text")
    void should_have_no_text_when_read_given_nothing_stored() {
        when(footnotes.find()).thenReturn(Optional.empty());

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
