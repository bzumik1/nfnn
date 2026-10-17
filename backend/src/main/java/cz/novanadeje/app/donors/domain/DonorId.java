package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record DonorId(UUID value) {

    public DonorId {
        if (value == null) {
            throw new IllegalArgumentException("Donor id is required");
        }
    }

    public static DonorId newId(Instant at) {
        return new DonorId(UuidV7.generate(at));
    }

    public static DonorId of(String value) {
        return new DonorId(UUID.fromString(value));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
