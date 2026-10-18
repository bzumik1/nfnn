package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record DonationReceiptId(UUID value) {

    public DonationReceiptId {
        if (value == null) {
            throw new IllegalArgumentException("Donation receipt id is required");
        }
    }

    public static DonationReceiptId newId(Instant at) {
        return new DonationReceiptId(UuidV7.generate(at));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
