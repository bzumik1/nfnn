package cz.novanadeje.app.shared.application.administration;

import java.util.Optional;

public record ConnectedClient(Optional<String> name) {

    public ConnectedClient {
        if (name == null) {
            throw new IllegalArgumentException("A connected client needs its name, which may be absent");
        }
    }

    public static ConnectedClient none() {
        return new ConnectedClient(Optional.empty());
    }
}
