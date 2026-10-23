package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.NotFound;

import java.util.UUID;

public class ConnectedAppNotFound extends NotFound {

    public ConnectedAppNotFound(UUID id) {
        super("donors/connected-app-not-found", "Connected application " + id + " does not exist");
    }
}
