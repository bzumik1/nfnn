package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class EmailAlreadyConfirmed extends Conflict {

    public EmailAlreadyConfirmed(DonorId id) {
        super("donors/email-already-confirmed", "The e-mail of donor " + id + " is already confirmed");
    }
}
