package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SignatoryNameUnprintable extends Conflict {

    public static final String CODE = "content/signatory-name-unprintable";

    public SignatoryNameUnprintable(PersonId id) {
        super(CODE, "Person " + id + " signs the donation receipts, so their name keeps to the characters a receipt can print");
    }
}
