package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class AdministratorEmailNotConfirmed extends Conflict {

    public AdministratorEmailNotConfirmed(DonorId id) {
        super("donors/administrator-email-not-confirmed", "Donor " + id + " has not confirmed the e-mail and cannot administer the site");
    }
}
