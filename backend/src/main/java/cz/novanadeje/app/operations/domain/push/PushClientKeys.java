package cz.novanadeje.app.operations.domain.push;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.Base64;

public record PushClientKeys(String p256dh, String auth) {

    public static final int MAX_LENGTH = 100;
    private static final int POINT_BYTES = 65;
    private static final int COORDINATE_BYTES = 32;
    private static final int AUTH_BYTES = 16;
    private static final BigInteger P = new BigInteger("ffffffff00000001000000000000000000000000ffffffffffffffffffffffff", 16);
    private static final BigInteger A = P.subtract(BigInteger.valueOf(3));
    private static final BigInteger B = new BigInteger("5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b", 16);

    public PushClientKeys {
        p256dh = unpadded(p256dh);
        auth = unpadded(auth);
        if (!isPoint(decode(p256dh)) || decode(auth).length != AUTH_BYTES) {
            throw new PushKeysRefused();
        }
    }

    public byte[] p256dhBytes() {
        return decode(p256dh);
    }

    public byte[] authBytes() {
        return decode(auth);
    }

    @Override
    public String toString() {
        return "PushClientKeys[<secret>]";
    }

    private static String unpadded(String value) {
        if (value == null || value.length() > MAX_LENGTH) {
            throw new PushKeysRefused();
        }
        return value.replaceFirst("=+$", "");
    }

    private static byte[] decode(String value) {
        try {
            return Base64.getUrlDecoder().decode(value);
        } catch (IllegalArgumentException malformed) {
            throw new PushKeysRefused();
        }
    }

    private static boolean isPoint(byte[] point) {
        if (point.length != POINT_BYTES || point[0] != 0x04) {
            return false;
        }
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(point, 1, 1 + COORDINATE_BYTES));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(point, 1 + COORDINATE_BYTES, POINT_BYTES));
        if (x.compareTo(P) >= 0 || y.compareTo(P) >= 0) {
            return false;
        }
        return y.multiply(y).mod(P).equals(x.pow(3).add(A.multiply(x)).add(B).mod(P));
    }
}
