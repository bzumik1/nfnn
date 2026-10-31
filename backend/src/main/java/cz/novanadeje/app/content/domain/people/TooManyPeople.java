package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class TooManyPeople extends Conflict {

    public static final String CODE = "content/too-many-people";

    public TooManyPeople() {
        super(CODE, "The foundation shows at most " + Person.MAX_PEOPLE + " people");
    }
}
