package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class AlreadyAdministrator extends Conflict {

    public AlreadyAdministrator(DonorId id) {
        super("donors/already-administrator", "Donor " + id + " is already an administrator");
    }
}
