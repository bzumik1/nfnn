package cz.novanadeje.app.shared.infrastructure.ratelimit;

import java.util.Objects;

public record ClientAddressKey(String value) {

    public ClientAddressKey {
        Objects.requireNonNull(value, "clientAddress");
    }
}
