package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class PeopleOrderMismatch extends RuleViolation {

    public static final String CODE = "content/people-order-mismatch";

    public PeopleOrderMismatch() {
        super(CODE, "The order names every person of the foundation exactly once");
    }
}
