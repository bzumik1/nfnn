package cz.novanadeje.app.operations.domain.push;

import java.util.regex.Pattern;

public record VapidKeys(String publicKey, String privateKey) {

    private static final Pattern PUBLIC_KEY = Pattern.compile("B[A-Za-z0-9_-]{86}");
    private static final Pattern PRIVATE_KEY = Pattern.compile("[A-Za-z0-9_-]{43}");

    public VapidKeys {
        if (publicKey == null || !PUBLIC_KEY.matcher(publicKey).matches() || privateKey == null || !PRIVATE_KEY.matcher(privateKey).matches()) {
            throw new IllegalArgumentException("VAPID keys are an uncompressed P-256 point and a scalar, both in base64url");
        }
    }

    @Override
    public String toString() {
        return "VapidKeys[publicKey=" + publicKey + ", privateKey=<secret>]";
    }
}
