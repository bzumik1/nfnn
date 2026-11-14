package cz.novanadeje.app.shared.application.session;

import java.util.Optional;
import java.util.UUID;

public record CurrentDevice(Optional<UUID> id) {

    public CurrentDevice {
        if (id == null) {
            throw new IllegalArgumentException("A current device needs its id, which may be absent");
        }
    }

    public static CurrentDevice none() {
        return new CurrentDevice(Optional.empty());
    }
}
