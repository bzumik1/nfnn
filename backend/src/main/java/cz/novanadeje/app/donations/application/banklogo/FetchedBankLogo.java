package cz.novanadeje.app.donations.application.banklogo;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;

public record FetchedBankLogo(byte[] webp, String sha256) {

    public static final int MAX_BYTES = 64 * 1024;

    public FetchedBankLogo {
        if (webp == null || webp.length == 0 || webp.length > MAX_BYTES || sha256 == null) {
            throw new IllegalArgumentException("A fetched bank logo is a WebP image of at most " + MAX_BYTES + " bytes with its digest");
        }
        webp = webp.clone();
    }

    public static FetchedBankLogo of(byte[] webp) {
        return new FetchedBankLogo(webp, sha256Of(webp));
    }

    @Override
    public byte[] webp() {
        return webp.clone();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof FetchedBankLogo logo && sha256.equals(logo.sha256) && Arrays.equals(webp, logo.webp);
    }

    @Override
    public int hashCode() {
        return 31 * Arrays.hashCode(webp) + sha256.hashCode();
    }

    @Override
    public String toString() {
        return "FetchedBankLogo[" + webp.length + " bytes, sha256 " + sha256 + "]";
    }

    private static String sha256Of(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }
}
