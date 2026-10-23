package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class ClientNotAllowed extends RuleViolation {

    public ClientNotAllowed(ClientId clientId) {
        super("donors/client-not-allowed", "The OAuth client " + clientId.host() + " is not among the allowed client hosts");
    }
}
