package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class DonorNotFound extends NotFound {

    public DonorNotFound(DonorId id) {
        super("donors/donor-not-found", "Donor " + id + " does not exist");
    }
}
