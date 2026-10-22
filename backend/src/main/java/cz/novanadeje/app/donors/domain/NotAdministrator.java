package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class NotAdministrator extends Conflict {

    public NotAdministrator(DonorId id) {
        super("donors/not-administrator", "Donor " + id + " is not an administrator");
    }
}
