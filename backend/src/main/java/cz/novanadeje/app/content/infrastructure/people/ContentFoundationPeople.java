package cz.novanadeje.app.content.infrastructure.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import cz.novanadeje.app.content.infrastructure.media.PrintPortraits;
import cz.novanadeje.app.shared.application.people.FoundationPeople;
import cz.novanadeje.app.shared.application.people.FoundationPerson;
import cz.novanadeje.app.shared.application.people.PrintPortrait;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Component
class ContentFoundationPeople implements FoundationPeople {

    private static final int PORTRAITS_KEPT = 4;

    private final PersonRepository people;
    private final MediaImageRepository media;
    private final Map<MediaId, PrintPortrait> prepared = Collections.synchronizedMap(new LinkedHashMap<>(PORTRAITS_KEPT, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<MediaId, PrintPortrait> eldest) {
            return size() > PORTRAITS_KEPT;
        }
    });

    ContentFoundationPeople(PersonRepository people, MediaImageRepository media) {
        this.people = people;
        this.media = media;
    }

    @Override
    public Optional<FoundationPerson> find(UUID personId) {
        return people.findById(new PersonId(personId))
                .map(person -> new FoundationPerson(personId, person.details().name(), person.details().portrait().isPresent()));
    }

    @Override
    public Optional<PrintPortrait> printPortraitOf(UUID personId) {
        return people.findById(new PersonId(personId))
                .map(Person::details)
                .flatMap(details -> details.portrait())
                .flatMap(this::prepared);
    }

    private Optional<PrintPortrait> prepared(MediaId portrait) {
        PrintPortrait known = prepared.get(portrait);
        if (known != null) {
            return Optional.of(known);
        }
        Optional<PrintPortrait> fresh = media.findById(portrait).map(MediaImage::largest).map(PrintPortraits::prepare);
        fresh.ifPresent(print -> prepared.put(portrait, print));
        return fresh;
    }
}
