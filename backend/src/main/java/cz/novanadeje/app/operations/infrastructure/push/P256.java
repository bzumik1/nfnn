package cz.novanadeje.app.operations.infrastructure.push;

import java.math.BigInteger;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECFieldFp;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;

final class P256 {

    static final int COORDINATE_BYTES = 32;
    static final int UNCOMPRESSED_BYTES = 1 + 2 * COORDINATE_BYTES;
    private static final byte UNCOMPRESSED = 0x04;
    private static final String CURVE = "secp256r1";
    private static final ECParameterSpec PARAMETERS = parameters();

    private P256() {
    }

    static KeyPair generate() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec(CURVE));
            return generator.generateKeyPair();
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("P-256 keys cannot be generated", failure);
        }
    }

    static ECPublicKey publicKey(byte[] uncompressed) {
        if (uncompressed.length != UNCOMPRESSED_BYTES || uncompressed[0] != UNCOMPRESSED) {
            throw new IllegalArgumentException("A P-256 public key is an uncompressed point of 65 bytes");
        }
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(uncompressed, 1, 1 + COORDINATE_BYTES));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(uncompressed, 1 + COORDINATE_BYTES, UNCOMPRESSED_BYTES));
        if (!onCurve(x, y)) {
            throw new IllegalArgumentException("The public key is not a point of P-256");
        }
        try {
            return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), PARAMETERS));
        } catch (GeneralSecurityException failure) {
            throw new IllegalArgumentException("The public key is not a point of P-256", failure);
        }
    }

    static ECPrivateKey privateKey(byte[] scalar) {
        if (scalar.length != COORDINATE_BYTES) {
            throw new IllegalArgumentException("A P-256 private key is a scalar of 32 bytes");
        }
        BigInteger value = new BigInteger(1, scalar);
        if (value.signum() == 0 || value.compareTo(PARAMETERS.getOrder()) >= 0) {
            throw new IllegalArgumentException("The private key is outside the order of P-256");
        }
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(value, PARAMETERS));
        } catch (GeneralSecurityException failure) {
            throw new IllegalArgumentException("The private key is not a P-256 key", failure);
        }
    }

    static KeyPair keyPair(byte[] scalar, byte[] uncompressedPublic) {
        return new KeyPair(publicKey(uncompressedPublic), privateKey(scalar));
    }

    static byte[] uncompressed(ECPublicKey key) {
        byte[] point = new byte[UNCOMPRESSED_BYTES];
        point[0] = UNCOMPRESSED;
        unsigned(key.getW().getAffineX(), point, 1);
        unsigned(key.getW().getAffineY(), point, 1 + COORDINATE_BYTES);
        return point;
    }

    static byte[] scalar(ECPrivateKey key) {
        byte[] scalar = new byte[COORDINATE_BYTES];
        unsigned(key.getS(), scalar, 0);
        return scalar;
    }

    private static boolean onCurve(BigInteger x, BigInteger y) {
        BigInteger p = ((ECFieldFp) PARAMETERS.getCurve().getField()).getP();
        if (x.compareTo(p) >= 0 || y.compareTo(p) >= 0) {
            return false;
        }
        BigInteger left = y.multiply(y).mod(p);
        BigInteger right = x.pow(3).add(PARAMETERS.getCurve().getA().multiply(x)).add(PARAMETERS.getCurve().getB()).mod(p);
        return left.equals(right);
    }

    private static void unsigned(BigInteger value, byte[] target, int offset) {
        byte[] bytes = value.toByteArray();
        int start = Math.max(0, bytes.length - COORDINATE_BYTES);
        int length = bytes.length - start;
        System.arraycopy(bytes, start, target, offset + COORDINATE_BYTES - length, length);
    }

    private static ECParameterSpec parameters() {
        try {
            AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
            parameters.init(new ECGenParameterSpec(CURVE));
            return parameters.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("The JDK knows no P-256", failure);
        }
    }
}
