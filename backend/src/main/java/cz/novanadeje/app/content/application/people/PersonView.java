package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.shared.domain.EmailAddress;

import java.util.Optional;

public record PersonView(PersonId id, String name, Optional<String> role, int position, boolean onBoard, Optional<String> boardNote,
                         boolean featured, Optional<PersonImageView> portrait, Optional<PersonImageView> webSignature,
                         Optional<EmailAddress> personalEmail, Optional<EmailAddress> fundEmail) {

    static PersonView of(Person person, MediaImageRepository media) {
        return new PersonView(person.id(), person.details().name(), person.details().role(), person.position(), person.details().onBoard(),
                person.details().boardNote(), person.details().featured(), PersonImageView.of(person.details().portrait(), media),
                PersonImageView.of(person.webSignature(), media), person.details().emails().personal(), person.details().emails().fund());
    }
}
