package cz.novanadeje.app.donations.infrastructure.signing;

import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.EdECPublicKey;
import java.security.spec.EdECPoint;
import java.security.spec.EdECPublicKeySpec;
import java.security.spec.NamedParameterSpec;

final class Ed25519ReceiptSigner implements ReceiptSigner {

    private static final String ALGORITHM = "Ed25519";
    private static final int KEY_BYTES = 32;
    private static final int SIGN_BIT = 0x80;

    private final PrivateKey privateKey;
    private final byte[] publicKey;
    private final ReceiptSigningKeyId keyId;

    private Ed25519ReceiptSigner(PrivateKey privateKey, byte[] publicKey) {
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.keyId = ReceiptSigningKeyId.of(publicKey);
    }

    static Ed25519ReceiptSigner fromSeed(byte[] seed) {
        if (seed.length != KEY_BYTES) {
            throw new IllegalArgumentException("An Ed25519 seed has " + KEY_BYTES + " bytes");
        }
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance(ALGORITHM);
            generator.initialize(NamedParameterSpec.ED25519, new SeedRandom(seed));
            KeyPair pair = generator.generateKeyPair();
            return new Ed25519ReceiptSigner(pair.getPrivate(), raw((EdECPublicKey) pair.getPublic()));
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("Ed25519 is part of every Java 25 platform", failure);
        }
    }

    @Override
    public ReceiptSigningKeyId keyId() {
        return keyId;
    }

    @Override
    public byte[] publicKey() {
        return publicKey.clone();
    }

    @Override
    public byte[] sign(byte[] message) {
        try {
            Signature signature = Signature.getInstance(ALGORITHM);
            signature.initSign(privateKey);
            signature.update(message);
            return signature.sign();
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("A receipt could not be signed", failure);
        }
    }

    @Override
    public boolean verifies(byte[] publicKey, byte[] message, byte[] signature) {
        try {
            Signature verifier = Signature.getInstance(ALGORITHM);
            verifier.initVerify(publicKeyOf(publicKey));
            verifier.update(message);
            return verifier.verify(signature);
        } catch (GeneralSecurityException | IllegalArgumentException refused) {
            return false;
        }
    }

    private static byte[] raw(EdECPublicKey key) {
        byte[] bigEndian = key.getPoint().getY().toByteArray();
        byte[] littleEndian = new byte[KEY_BYTES];
        for (int at = 0; at < Math.min(bigEndian.length, KEY_BYTES); at++) {
            littleEndian[at] = bigEndian[bigEndian.length - 1 - at];
        }
        if (key.getPoint().isXOdd()) {
            littleEndian[KEY_BYTES - 1] |= (byte) SIGN_BIT;
        }
        return littleEndian;
    }

    private static PublicKey publicKeyOf(byte[] raw) throws GeneralSecurityException {
        if (raw.length != KEY_BYTES) {
            throw new IllegalArgumentException("An Ed25519 public key has " + KEY_BYTES + " bytes");
        }
        byte[] bigEndian = new byte[KEY_BYTES];
        for (int at = 0; at < KEY_BYTES; at++) {
            bigEndian[at] = raw[KEY_BYTES - 1 - at];
        }
        boolean xOdd = (bigEndian[0] & SIGN_BIT) != 0;
        bigEndian[0] &= (byte) ~SIGN_BIT;
        return KeyFactory.getInstance(ALGORITHM).generatePublic(new EdECPublicKeySpec(NamedParameterSpec.ED25519,
                new EdECPoint(xOdd, new BigInteger(1, bigEndian))));
    }

    private static final class SeedRandom extends SecureRandom {

        private final byte[] seed;

        private SeedRandom(byte[] seed) {
            this.seed = seed.clone();
        }

        @Override
        public void nextBytes(byte[] bytes) {
            if (bytes.length != seed.length) {
                throw new IllegalStateException("Ed25519 asked for " + bytes.length + " random bytes instead of its " + seed.length + "-byte seed");
            }
            System.arraycopy(seed, 0, bytes, 0, seed.length);
        }
    }
}
