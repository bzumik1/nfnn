package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record SenderAccountLinkId(UUID value) {

    public SenderAccountLinkId {
        if (value == null) {
            throw new IllegalArgumentException("Sender account link id is required");
        }
    }

    public static SenderAccountLinkId newId(Instant at) {
        return new SenderAccountLinkId(UuidV7.generate(at));
    }

    public static SenderAccountLinkId of(String value) {
        return new SenderAccountLinkId(UUID.fromString(value));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
