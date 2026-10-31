package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.people.PeopleOrder;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonDetails;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.people.PersonImageInUse;
import cz.novanadeje.app.content.domain.people.PersonNotFound;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import cz.novanadeje.app.content.domain.people.PersonSignsReceipts;
import cz.novanadeje.app.content.domain.people.ReceiptPortraitInBrowserOnly;
import cz.novanadeje.app.content.domain.people.TooManyPeople;
import cz.novanadeje.app.content.domain.people.WebSignatureInBrowserOnly;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.FoundationPersonRemoved;
import cz.novanadeje.app.shared.application.people.ReceiptSignatoryLookup;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class PeopleAdminService {

    static final String ADD_ACTION = "ADD_PERSON";
    static final String UPDATE_ACTION = "UPDATE_PERSON";
    static final String REMOVE_ACTION = "REMOVE_PERSON";
    static final String ORDER_ACTION = "ORDER_PEOPLE";
    static final String CHANGE_SIGNATURE_ACTION = "CHANGE_WEB_SIGNATURE";
    static final String REMOVE_SIGNATURE_ACTION = "REMOVE_WEB_SIGNATURE";

    private final PersonRepository people;
    private final MediaImageRepository media;
    private final ReceiptSignatoryLookup signatories;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public PeopleAdminService(PersonRepository people, MediaImageRepository media, ReceiptSignatoryLookup signatories,
                              ApplicationEventPublisher events, Clock clock) {
        this.people = people;
        this.media = media;
        this.signatories = signatories;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<PersonView> list() {
        return people.findAllInOrder().stream().map(this::view).toList();
    }

    public PersonView add(UUID adminId, PersonCommand command) {
        Instant now = clock.instant();
        List<Person> current = people.findAllInOrderForUpdate();
        if (current.size() >= Person.MAX_PEOPLE) {
            throw new TooManyPeople();
        }
        PersonDetails details = checked(command.toDetails());
        int position = current.stream().mapToInt(Person::position).max().orElse(-1) + 1;
        Person added = Person.add(PersonId.newId(now), details, position, now);
        people.save(added);
        publish(adminId, ADD_ACTION, "Osoba " + added.id() + " přidána mezi lidi fondu", now);
        return view(added);
    }

    public PersonView update(UUID adminId, PersonId id, PersonCommand command, boolean inBrowser) {
        Instant now = clock.instant();
        Person current = find(id);
        PersonDetails details = checked(command.toDetails());
        if (current.webSignature().isPresent() && !inBrowser && !details.name().equals(current.details().name())) {
            throw new WebSignatureInBrowserOnly();
        }
        if (!inBrowser && !details.portrait().equals(current.details().portrait()) && signatories.signsReceipts(id.value())) {
            throw new ReceiptPortraitInBrowserOnly();
        }
        Person edited = current.edit(details, now);
        people.save(edited);
        current.imagesLeftBy(edited).forEach(media::deleteIfUnused);
        publish(adminId, UPDATE_ACTION, "Osoba " + id + " v lidech fondu upravena", now);
        return view(edited);
    }

    public void remove(UUID adminId, PersonId id, boolean inBrowser) {
        Instant now = clock.instant();
        Person current = find(id);
        if (signatories.signsReceipts(id.value())) {
            throw new PersonSignsReceipts(id);
        }
        if (current.webSignature().isPresent() && !inBrowser) {
            throw new WebSignatureInBrowserOnly();
        }
        people.delete(id);
        current.images().forEach(media::deleteIfUnused);
        publish(adminId, REMOVE_ACTION, "Osoba " + id + " odebrána z lidí fondu", now);
        events.publishEvent(new FoundationPersonRemoved(id.value(), now));
    }

    public List<PersonView> order(UUID adminId, List<PersonId> order) {
        Instant now = clock.instant();
        List<Person> ordered = PeopleOrder.apply(people.findAllInOrderForUpdate(), order, now);
        ordered.forEach(people::save);
        publish(adminId, ORDER_ACTION, "Pořadí lidí fondu změněno", now);
        return ordered.stream().map(this::view).toList();
    }

    public PersonView setWebSignature(UUID adminId, PersonId id, MediaId signature) {
        Instant now = clock.instant();
        Person current = find(id);
        if (media.findSize(signature).isEmpty()) {
            throw new MediaNotFound(signature);
        }
        if (people.isAnyonesPortrait(signature)) {
            throw new PersonImageInUse(signature);
        }
        Person signed = current.signWith(signature, now);
        people.save(signed);
        current.imagesLeftBy(signed).forEach(media::deleteIfUnused);
        publish(adminId, CHANGE_SIGNATURE_ACTION, "Podpis " + signature + " na webu u osoby " + id + " nastaven", now);
        return view(signed);
    }

    public PersonView removeWebSignature(UUID adminId, PersonId id) {
        Instant now = clock.instant();
        Person current = find(id);
        if (current.webSignature().isEmpty()) {
            return view(current);
        }
        Person unsigned = current.withoutWebSignature(now);
        people.save(unsigned);
        current.imagesLeftBy(unsigned).forEach(media::deleteIfUnused);
        publish(adminId, REMOVE_SIGNATURE_ACTION, "Podpis na webu u osoby " + id + " odebrán", now);
        return view(unsigned);
    }

    private PersonDetails checked(PersonDetails details) {
        details.portrait().filter(portrait -> media.findSize(portrait).isEmpty()).ifPresent(portrait -> {
            throw new MediaNotFound(portrait);
        });
        details.portrait().filter(people::isAnyonesWebSignature).ifPresent(portrait -> {
            throw new PersonImageInUse(portrait);
        });
        return details;
    }

    private Person find(PersonId id) {
        return people.findByIdForUpdate(id).orElseThrow(() -> new PersonNotFound(id));
    }

    private PersonView view(Person person) {
        return PersonView.of(person, media);
    }

    private void publish(UUID adminId, String action, String details, Instant now) {
        events.publishEvent(new AdminActionPerformed(adminId, action, Optional.empty(), details, now));
    }
}
