package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import cz.novanadeje.app.content.application.ContentVersions;
import cz.novanadeje.app.content.application.Versioned;
import cz.novanadeje.app.content.domain.ChangedMeanwhile;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
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
    private final ContentVersions versions;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public FoundersNoteService(FoundersNoteRepository notes, ContentVersions versions, ApplicationEventPublisher events, Clock clock) {
        this.notes = notes;
        this.versions = versions;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Versioned<Optional<String>> current() {
        Optional<FoundersNote> stored = notes.find();
        return new Versioned<>(stored.flatMap(FoundersNote::text), versions.ofFoundersNote(stored));
    }

    public Versioned<Optional<String>> change(UUID adminId, Optional<String> text, ExpectedVersion expected) {
        notes.lockForChange();
        Optional<FoundersNote> stored = notes.find();
        String version = versions.ofFoundersNote(stored);
        if (!expected.admits(version)) {
            throw new ChangedMeanwhile(version, ContentVersions.StoredPageText.ofNote(stored));
        }
        Instant now = clock.instant();
        FoundersNote next = new FoundersNote(text, now);
        if (next.text().equals(stored.flatMap(FoundersNote::text))) {
            return new Versioned<>(next.text(), version);
        }
        notes.save(next);
        String details = next.text().isPresent() ? "Slovo zakladatelů upraveno" : "Slovo zakladatelů odebráno";
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(), details, now));
        return new Versioned<>(next.text(), versions.ofFoundersNote(Optional.of(next)));
    }
}
