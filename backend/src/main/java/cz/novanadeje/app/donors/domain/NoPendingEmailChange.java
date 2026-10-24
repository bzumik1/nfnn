package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class NoPendingEmailChange extends Conflict {

    public NoPendingEmailChange(DonorId donorId) {
        super("donors/no-pending-email-change", "Donor " + donorId + " has no e-mail change waiting for confirmation");
    }
}
