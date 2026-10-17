package cz.novanadeje.app.donations.domain.donor;

import java.util.UUID;

public record DonorReference(UUID value) {

    public DonorReference {
        if (value == null) {
            throw new IllegalArgumentException("Donor reference is required");
        }
    }

    public static DonorReference of(String value) {
        return new DonorReference(UUID.fromString(value));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
