package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record SymbolClaimId(UUID value) {

    public SymbolClaimId {
        if (value == null) {
            throw new IllegalArgumentException("Symbol claim id is required");
        }
    }

    public static SymbolClaimId newId(Instant at) {
        return new SymbolClaimId(UuidV7.generate(at));
    }

    public static SymbolClaimId of(String value) {
        return new SymbolClaimId(UUID.fromString(value));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
