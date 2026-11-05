package cz.novanadeje.app.operations.infrastructure.push;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Base64;

public final class PushReceiver {

    private static final Base64.Encoder BASE64URL = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder FROM_BASE64URL = Base64.getUrlDecoder();
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SCHEME = "vapid t=";
    private static final String KEY_SEPARATOR = ", k=";
    private static final int AUTH_SECRET_BYTES = 16;

    private final byte[] privateKey;
    private final byte[] publicKey;
    private final byte[] authSecret;

    private PushReceiver(byte[] privateKey, byte[] publicKey, byte[] authSecret) {
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.authSecret = authSecret;
    }

    public static PushReceiver generate() {
        KeyPair pair = P256.generate();
        byte[] authSecret = new byte[AUTH_SECRET_BYTES];
        new SecureRandom().nextBytes(authSecret);
        return new PushReceiver(P256.scalar((ECPrivateKey) pair.getPrivate()), P256.uncompressed((ECPublicKey) pair.getPublic()), authSecret);
    }

    public String p256dh() {
        return BASE64URL.encodeToString(publicKey);
    }

    public String auth() {
        return BASE64URL.encodeToString(authSecret);
    }

    public String decrypt(byte[] body) {
        return new String(WebPushDecryption.decrypt(body, privateKey, publicKey, authSecret), StandardCharsets.UTF_8);
    }

    public static VapidClaims verifiedVapid(String authorization) {
        if (!authorization.startsWith(SCHEME) || !authorization.contains(KEY_SEPARATOR)) {
            throw new AssertionError("Not a VAPID authorization");
        }
        String rest = authorization.substring(SCHEME.length());
        String token = rest.substring(0, rest.indexOf(KEY_SEPARATOR));
        String key = rest.substring(rest.indexOf(KEY_SEPARATOR) + KEY_SEPARATOR.length());
        int lastDot = token.lastIndexOf('.');
        String signed = token.substring(0, lastDot);
        try {
            Signature signature = Signature.getInstance("SHA256withECDSAinP1363Format");
            signature.initVerify(P256.publicKey(FROM_BASE64URL.decode(key)));
            signature.update(signed.getBytes(StandardCharsets.US_ASCII));
            if (!signature.verify(FROM_BASE64URL.decode(token.substring(lastDot + 1)))) {
                throw new AssertionError("The VAPID token does not verify under its key");
            }
        } catch (GeneralSecurityException failure) {
            throw new AssertionError("The VAPID token cannot be verified", failure);
        }
        JsonNode claims = JSON.readTree(FROM_BASE64URL.decode(signed.substring(signed.indexOf('.') + 1)));
        return new VapidClaims(key, claims.get("aud").asString(), claims.get("sub").asString(), claims.get("exp").asLong());
    }

    public record VapidClaims(String publicKey, String audience, String subject, long expiresAtEpochSecond) {
    }
}
