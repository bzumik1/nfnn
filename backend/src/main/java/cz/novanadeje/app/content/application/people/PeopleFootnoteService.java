package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import cz.novanadeje.app.content.domain.people.PeopleFootnoteRepository;
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
public class PeopleFootnoteService {

    static final String CHANGE_ACTION = "CHANGE_PEOPLE_FOOTNOTE";

    private final PeopleFootnoteRepository footnotes;
    private final ContentVersions versions;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public PeopleFootnoteService(PeopleFootnoteRepository footnotes, ContentVersions versions, ApplicationEventPublisher events, Clock clock) {
        this.footnotes = footnotes;
        this.versions = versions;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Optional<String> read() {
        return footnotes.find().flatMap(PeopleFootnote::text);
    }

    @Transactional(readOnly = true)
    public Versioned<Optional<String>> current() {
        Optional<PeopleFootnote> stored = footnotes.find();
        return new Versioned<>(stored.flatMap(PeopleFootnote::text), versions.ofFootnote(stored));
    }

    public Versioned<Optional<String>> change(UUID adminId, Optional<String> text, ExpectedVersion expected) {
        footnotes.lockForChange();
        Optional<PeopleFootnote> stored = footnotes.find();
        String version = versions.ofFootnote(stored);
        if (!expected.admits(version)) {
            throw new ChangedMeanwhile(version, ContentVersions.StoredPageText.ofFootnote(stored));
        }
        Instant now = clock.instant();
        PeopleFootnote next = new PeopleFootnote(text, now);
        if (next.text().equals(stored.flatMap(PeopleFootnote::text))) {
            return new Versioned<>(next.text(), version);
        }
        footnotes.save(next);
        String details = next.text().isPresent() ? "Řádek pod správní radou upraven" : "Řádek pod správní radou odebrán";
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(), details, now));
        return new Versioned<>(next.text(), versions.ofFootnote(Optional.of(next)));
    }
}
