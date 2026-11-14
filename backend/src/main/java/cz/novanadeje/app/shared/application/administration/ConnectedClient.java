package cz.novanadeje.app.shared.application.administration;

import java.util.Optional;

public record ConnectedClient(Optional<String> name) {

    public ConnectedClient {
        if (name == null || name.filter(String::isBlank).isPresent()) {
            throw new IllegalArgumentException("A connected client's name is absent or not blank");
        }
    }

    public static ConnectedClient none() {
        return new ConnectedClient(Optional.empty());
    }
}
