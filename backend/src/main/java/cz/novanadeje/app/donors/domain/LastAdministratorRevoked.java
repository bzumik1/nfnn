package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class LastAdministratorRevoked extends Conflict {

    public LastAdministratorRevoked() {
        super("donors/last-administrator", "Taking the role would leave the site without an administrator");
    }
}
