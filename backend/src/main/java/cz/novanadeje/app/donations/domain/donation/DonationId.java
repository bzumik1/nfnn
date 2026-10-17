package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record DonationId(UUID value) {

    public DonationId {
        if (value == null) {
            throw new IllegalArgumentException("Donation id is required");
        }
    }

    public static DonationId newId(Instant at) {
        return new DonationId(UuidV7.generate(at));
    }

    public static DonationId of(String value) {
        return new DonationId(UUID.fromString(value));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
