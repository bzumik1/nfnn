package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record BankPaymentId(UUID value) {

    public BankPaymentId {
        if (value == null) {
            throw new IllegalArgumentException("Bank payment id is required");
        }
    }

    public static BankPaymentId newId(Instant at) {
        return new BankPaymentId(UuidV7.generate(at));
    }

    public static BankPaymentId of(String value) {
        return new BankPaymentId(UUID.fromString(value));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
