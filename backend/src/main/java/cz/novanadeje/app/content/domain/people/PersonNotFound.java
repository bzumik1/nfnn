package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class PersonNotFound extends NotFound {

    public static final String CODE = "content/person-not-found";

    public PersonNotFound(PersonId id) {
        super(CODE, "Person " + id + " does not exist");
    }
}
