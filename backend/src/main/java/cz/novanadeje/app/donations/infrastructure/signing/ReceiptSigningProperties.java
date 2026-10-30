package cz.novanadeje.app.donations.infrastructure.signing;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Base64;

@ConfigurationProperties("app.donations.receipt.signing")
record ReceiptSigningProperties(String key) {

    static final int SEED_BYTES = 32;
    static final String VARIABLE = "RECEIPT_SIGNING_KEY (app.donations.receipt.signing.key)";

    ReceiptSigningProperties {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException(VARIABLE + " is required");
        }
        key = key.strip();
        seedOf(key);
    }

    byte[] seed() {
        return seedOf(key);
    }

    private static byte[] seedOf(String key) {
        byte[] seed;
        try {
            seed = Base64.getDecoder().decode(key);
        } catch (IllegalArgumentException malformed) {
            throw new IllegalArgumentException(VARIABLE + " must be Base64", malformed);
        }
        if (seed.length != SEED_BYTES) {
            throw new IllegalArgumentException(VARIABLE + " must hold " + SEED_BYTES + " bytes, an Ed25519 seed");
        }
        return seed;
    }

    @Override
    public String toString() {
        return "ReceiptSigningProperties[key=********]";
    }
}
