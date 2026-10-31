package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.people.PersonDetails;
import cz.novanadeje.app.content.domain.people.PersonEmails;

import java.util.Optional;

public record PersonCommand(String name, Optional<String> role, boolean onBoard, Optional<String> boardNote, boolean featured,
                            Optional<MediaId> portrait, PersonEmails emails) {

    public PersonCommand {
        if (name == null || role == null || boardNote == null || portrait == null || emails == null) {
            throw new IllegalArgumentException("A person command carries the name, the role, the board note, the portrait and the e-mails even when absent");
        }
    }

    PersonDetails toDetails() {
        return new PersonDetails(name, role, onBoard, boardNote, featured, portrait, emails);
    }
}
