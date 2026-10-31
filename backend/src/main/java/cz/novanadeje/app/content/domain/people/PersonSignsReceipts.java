package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class PersonSignsReceipts extends Conflict {

    public static final String CODE = "content/person-signs-receipts";

    public PersonSignsReceipts(PersonId id) {
        super(CODE, "Person " + id + " signs the donation receipts and stays until another signatory is chosen");
    }
}
