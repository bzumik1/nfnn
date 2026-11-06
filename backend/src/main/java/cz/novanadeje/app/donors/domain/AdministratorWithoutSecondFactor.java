package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class AdministratorWithoutSecondFactor extends Conflict {

    public AdministratorWithoutSecondFactor(DonorId id) {
        super("donors/administrator-without-second-factor", "Donor " + id + " holds no second factor and cannot administer the site");
    }
}
