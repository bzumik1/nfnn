package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.EmailAddress;

import java.util.Optional;

public record PersonEmails(Optional<EmailAddress> personal, Optional<EmailAddress> fund) {

    public static final PersonEmails NONE = new PersonEmails(Optional.empty(), Optional.empty());

    public PersonEmails {
        if (personal == null || fund == null) {
            throw new IllegalArgumentException("A person's e-mails carry the personal and the fund address even when absent");
        }
    }
}
