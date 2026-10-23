package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class AdministratorRecoveryRefused extends AccessDenied {

    public AdministratorRecoveryRefused(DonorId id) {
        super("donors/administrator-recovery-refused", "Donor " + id + " is an administrator and recovers no passkey by e-mail");
    }
}
