package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class FoundersNoteService {

    static final String CHANGE_ACTION = "CHANGE_FOUNDERS_NOTE";

    private final FoundersNoteRepository notes;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public FoundersNoteService(FoundersNoteRepository notes, ApplicationEventPublisher events, Clock clock) {
        this.notes = notes;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Optional<String> read() {
        return notes.find().flatMap(FoundersNote::text);
    }

    public Optional<String> change(UUID adminId, Optional<String> text) {
        Instant now = clock.instant();
        FoundersNote next = new FoundersNote(text, now);
        if (next.text().equals(read())) {
            return next.text();
        }
        notes.save(next);
        String details = next.text().isPresent() ? "Slovo zakladatelů upraveno" : "Slovo zakladatelů odebráno";
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(), details, now));
        return next.text();
    }
}
