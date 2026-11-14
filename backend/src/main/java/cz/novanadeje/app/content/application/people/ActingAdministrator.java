package cz.novanadeje.app.content.application.people;

import java.util.Optional;
import java.util.UUID;

public record ActingAdministrator(UUID id, Optional<String> client) {

    public ActingAdministrator {
        if (id == null || client == null) {
            throw new IllegalArgumentException("An acting administrator has an id and a client (even when absent)");
        }
    }
}
