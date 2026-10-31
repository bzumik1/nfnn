package cz.novanadeje.app.donations.infrastructure.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@ConfigurationProperties("app.donations.receipt.signing")
record ReceiptSigningProperties(String key, List<String> withdrawnKeyIds) {

    static final int SEED_BYTES = 32;
    static final String VARIABLE = "RECEIPT_SIGNING_KEY (app.donations.receipt.signing.key)";
    static final String WITHDRAWN_VARIABLE = "RECEIPT_SIGNING_KEYS_WITHDRAWN (app.donations.receipt.signing.withdrawn-key-ids)";
    private static final Pattern KEY_ID = Pattern.compile("[0-9a-f]{8}");

    ReceiptSigningProperties {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException(VARIABLE + " is required");
        }
        key = key.strip();
        seedOf(key);
        withdrawnKeyIds = withdrawnKeyIds == null ? List.of()
                : withdrawnKeyIds.stream().map(String::strip).filter(id -> !id.isEmpty()).toList();
        withdrawnKeyIds.stream().filter(id -> !KEY_ID.matcher(id).matches()).findFirst().ifPresent(id -> {
            throw new IllegalArgumentException(WITHDRAWN_VARIABLE + " names key ids of 8 lowercase hex characters, separated by commas");
        });
    }

    Set<ReceiptSigningKeyId> withdrawnKeys() {
        return withdrawnKeyIds.stream().map(ReceiptSigningKeyId::new).collect(Collectors.toUnmodifiableSet());
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
        return "ReceiptSigningProperties[key=********, withdrawnKeyIds=" + withdrawnKeyIds + "]";
    }
}
