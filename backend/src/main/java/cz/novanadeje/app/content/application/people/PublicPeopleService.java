package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class PublicPeopleService {

    private final PersonRepository people;
    private final FoundersNoteRepository notes;
    private final MediaImageRepository media;

    public PublicPeopleService(PersonRepository people, FoundersNoteRepository notes, MediaImageRepository media) {
        this.people = people;
        this.notes = notes;
        this.media = media;
    }

    public Optional<PublicPeopleView> read() {
        List<Person> all = people.findAllInOrder();
        if (all.isEmpty()) {
            return Optional.empty();
        }
        List<Person> featured = all.stream().filter(person -> person.details().featured()).toList();
        return Optional.of(new PublicPeopleView(
                featured.stream().map(this::card).toList(),
                all.stream().filter(person -> person.details().onBoard())
                        .map(person -> new BoardMemberView(person.details().name(), person.details().boardNote())).toList(),
                notes.find().flatMap(FoundersNote::text).map(text -> new FoundersNoteView(text, signatures(featured)))));
    }

    private FeaturedPersonView card(Person person) {
        return new FeaturedPersonView(person.details().name(), person.details().role(), PersonImageView.of(person.details().portrait(), media));
    }

    private List<SignatureView> signatures(List<Person> featured) {
        return featured.stream()
                .flatMap(person -> PersonImageView.of(person.webSignature(), media).map(image -> new SignatureView(image, person.details().name())).stream())
                .toList();
    }
}
