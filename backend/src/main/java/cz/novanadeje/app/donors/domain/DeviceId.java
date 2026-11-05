package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record DeviceId(UUID value) {

    public DeviceId {
        if (value == null) {
            throw new IllegalArgumentException("Device id is required");
        }
    }

    public static DeviceId newId(Instant at) {
        return new DeviceId(UuidV7.generate(at));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
