package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class AdministratorRequired extends AccessDenied {

    public AdministratorRequired(DonorId id) {
        super("donors/administrator-required", "Donor " + id + " is not signed in as an administrator");
    }
}
