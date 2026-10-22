package cz.novanadeje.app.donors.domain;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.OptionalLong;
import java.util.regex.Pattern;

public final class Totp {

    public static final int DIGITS = 6;
    public static final long STEP_SECONDS = 30;
    private static final int WINDOW = 1;
    private static final int MODULUS = 1_000_000;
    public static final String CODE_SHAPE = "^[0-9]{" + DIGITS + "}$";
    private static final Pattern CODE = Pattern.compile(CODE_SHAPE);

    private Totp() {
    }

    public static long stepAt(Instant at) {
        return Math.floorDiv(at.getEpochSecond(), STEP_SECONDS);
    }

    public static String codeAt(TotpSecret secret, long step) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret.bytes(), "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(Long.BYTES).putLong(step).array());
            int offset = hash[hash.length - 1] & 0x0f;
            int binary = (hash[offset] & 0x7f) << 24 | (hash[offset + 1] & 0xff) << 16 | (hash[offset + 2] & 0xff) << 8 | hash[offset + 3] & 0xff;
            return String.format("%0" + DIGITS + "d", binary % MODULUS);
        } catch (GeneralSecurityException unavailable) {
            throw new IllegalStateException("HMAC-SHA1 is not available", unavailable);
        }
    }

    public static OptionalLong matchingStep(TotpSecret secret, String code, Instant at) {
        if (code == null || !CODE.matcher(code).matches()) {
            return OptionalLong.empty();
        }
        long current = stepAt(at);
        for (long step = current - WINDOW; step <= current + WINDOW; step++) {
            if (codeAt(secret, step).equals(code)) {
                return OptionalLong.of(step);
            }
        }
        return OptionalLong.empty();
    }
}
