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

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Optional;
import java.util.UUID;

@Component
class ContentFoundationPeople implements FoundationPeople {

    private static final int PORTRAITS_KEPT = 4;

    private static final Logger log = LoggerFactory.getLogger(ContentFoundationPeople.class);

    private final PersonRepository people;
    private final MediaImageRepository media;
    private final Cache<MediaId, Optional<PrintPortrait>> prepared = Caffeine.newBuilder()
            .maximumSize(PORTRAITS_KEPT)
            .executor(Runnable::run)
            .build();

    ContentFoundationPeople(PersonRepository people, MediaImageRepository media) {
        this.people = people;
        this.media = media;
    }

    @Override
    public Optional<FoundationPerson> find(UUID personId) {
        return people.findById(new PersonId(personId)).map(person -> foundationPerson(personId, person));
    }

    @Override
    public Optional<FoundationPerson> findForUpdate(UUID personId) {
        return people.findByIdForUpdate(new PersonId(personId)).map(person -> foundationPerson(personId, person));
    }

    @Override
    public Optional<PrintPortrait> printPortraitOf(UUID personId) {
        return people.findById(new PersonId(personId))
                .map(Person::details)
                .flatMap(details -> details.portrait())
                .flatMap(portrait -> prepared.get(portrait, this::prepare));
    }

    long portraitsKept() {
        prepared.cleanUp();
        return prepared.estimatedSize();
    }

    private Optional<PrintPortrait> prepare(MediaId portrait) {
        Optional<MediaImage> image = media.findById(portrait);
        if (image.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(PrintPortraits.prepare(image.get().largest()));
        } catch (IllegalStateException undecodable) {
            log.warn("Portrait {} cannot be prepared for print, the receipt is issued without it", portrait.value());
            return Optional.empty();
        }
    }

    private static FoundationPerson foundationPerson(UUID personId, Person person) {
        return new FoundationPerson(personId, person.details().name(), person.details().portrait().isPresent());
    }
}
