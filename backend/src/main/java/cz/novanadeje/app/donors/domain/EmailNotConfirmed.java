package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class EmailNotConfirmed extends Conflict {

    public EmailNotConfirmed(DonorId id) {
        super("donors/email-not-confirmed", "The e-mail of donor " + id + " is not confirmed yet, so it does not change");
    }
}
