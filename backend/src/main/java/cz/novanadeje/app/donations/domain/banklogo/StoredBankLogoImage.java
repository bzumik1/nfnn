package cz.novanadeje.app.donations.domain.banklogo;

import java.util.regex.Pattern;

public record StoredBankLogoImage(BankLogoImageId id, String sha256) {

    private static final Pattern SHA256_HEX = Pattern.compile("[0-9a-f]{64}");

    public StoredBankLogoImage {
        if (id == null || sha256 == null || !SHA256_HEX.matcher(sha256).matches()) {
            throw new IllegalArgumentException("A stored bank logo image names its id and its SHA-256 in lowercase hex");
        }
    }
}
