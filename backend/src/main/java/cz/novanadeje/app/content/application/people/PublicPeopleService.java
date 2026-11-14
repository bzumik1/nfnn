package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaSize;
import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import cz.novanadeje.app.content.domain.people.PeopleFootnoteRepository;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@Transactional(readOnly = true)
public class PublicPeopleService {

    private final PersonRepository people;
    private final FoundersNoteRepository notes;
    private final PeopleFootnoteRepository footnotes;
    private final MediaImageRepository media;

    public PublicPeopleService(PersonRepository people, FoundersNoteRepository notes, PeopleFootnoteRepository footnotes, MediaImageRepository media) {
        this.people = people;
        this.notes = notes;
        this.footnotes = footnotes;
        this.media = media;
    }

    public Optional<PublicPeopleView> read() {
        List<Person> all = people.findAllInOrder();
        if (all.isEmpty()) {
            return Optional.empty();
        }
        List<Person> featured = all.stream().filter(person -> person.details().featured()).toList();
        Map<MediaId, MediaSize> sizes = media.findSizes(featured.stream()
                .flatMap(person -> Stream.concat(person.details().portrait().stream(), person.webSignature().stream())).collect(Collectors.toSet()));
        return Optional.of(new PublicPeopleView(
                featured.stream().map(person -> card(person, sizes)).toList(),
                all.stream().filter(person -> person.details().onBoard())
                        .map(person -> new BoardMemberView(person.details().name(), person.details().boardNote())).toList(),
                notes.find().flatMap(FoundersNote::text).map(text -> new FoundersNoteView(text, signatures(featured, sizes))),
                footnotes.find().flatMap(PeopleFootnote::text)));
    }

    private static FeaturedPersonView card(Person person, Map<MediaId, MediaSize> sizes) {
        return new FeaturedPersonView(person.details().name(), person.details().role(), PersonImageView.of(person.details().portrait(), sizes));
    }

    private static List<SignatureView> signatures(List<Person> featured, Map<MediaId, MediaSize> sizes) {
        return featured.stream()
                .flatMap(person -> PersonImageView.of(person.webSignature(), sizes).map(image -> new SignatureView(image, person.details().name(),
                        person.details().role(), PersonImageView.of(person.details().portrait(), sizes))).stream())
                .toList();
    }
}
