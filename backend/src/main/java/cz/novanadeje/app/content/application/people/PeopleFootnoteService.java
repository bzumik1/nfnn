package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import cz.novanadeje.app.content.domain.people.PeopleFootnoteRepository;
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
public class PeopleFootnoteService {

    static final String CHANGE_ACTION = "CHANGE_PEOPLE_FOOTNOTE";

    private final PeopleFootnoteRepository footnotes;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public PeopleFootnoteService(PeopleFootnoteRepository footnotes, ApplicationEventPublisher events, Clock clock) {
        this.footnotes = footnotes;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Optional<String> read() {
        return footnotes.find().flatMap(PeopleFootnote::text);
    }

    public Optional<String> change(UUID adminId, Optional<String> text) {
        Instant now = clock.instant();
        PeopleFootnote next = new PeopleFootnote(text, now);
        if (next.text().equals(read())) {
            return next.text();
        }
        footnotes.save(next);
        String details = next.text().isPresent() ? "Řádek pod správní radou upraven" : "Řádek pod správní radou odebrán";
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(), details, now));
        return next.text();
    }
}
