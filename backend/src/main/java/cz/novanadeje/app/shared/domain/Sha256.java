package cz.novanadeje.app.shared.domain;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;

public final class Sha256 {

    private static final String ALGORITHM = "SHA-256";

    private Sha256() {
    }

    public static byte[] digest(byte[] content) {
        try {
            return MessageDigest.getInstance(ALGORITHM).digest(content);
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is part of every Java platform", missing);
        }
    }

    public static String hex(byte[] content) {
        return HexFormat.of().formatHex(digest(content));
    }

    public static String base64Url(byte[] content) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest(content));
    }
}
