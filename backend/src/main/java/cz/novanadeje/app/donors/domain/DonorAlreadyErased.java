package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class DonorAlreadyErased extends Conflict {

    public DonorAlreadyErased(DonorId id) {
        super("donors/already-erased", "Donor " + id + " is already erased");
    }
}
