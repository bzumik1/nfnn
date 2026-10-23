package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class AdministratorNotErasable extends Conflict {

    public AdministratorNotErasable(DonorId id) {
        super("donors/administrator-not-erasable", "Donor " + id + " is an administrator and cannot be erased");
    }
}
