package cz.novanadeje.app.operations.infrastructure.push;

import javax.crypto.Cipher;
import javax.crypto.KDF;
import javax.crypto.KeyAgreement;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.HKDFParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.interfaces.ECPublicKey;
import java.util.Arrays;
import java.util.function.Supplier;

final class WebPushEncryption {

    static final int RECORD_SIZE = 4096;
    static final int SALT_BYTES = 16;
    static final int AUTH_SECRET_BYTES = 16;
    static final int HEADER_BYTES = SALT_BYTES + 4 + 1 + P256.UNCOMPRESSED_BYTES;
    private static final int TAG_BITS = 128;
    private static final int TAG_BYTES = TAG_BITS / 8;
    private static final byte LAST_RECORD_DELIMITER = 0x02;
    static final int MAX_PLAINTEXT_BYTES = RECORD_SIZE - HEADER_BYTES - TAG_BYTES - 1;
    private static final byte[] KEY_INFO = "WebPush: info\0".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] CEK_INFO = "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] NONCE_INFO = "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII);

    private final Supplier<KeyPair> senderKeys;
    private final Supplier<byte[]> salts;

    WebPushEncryption(Supplier<KeyPair> senderKeys, Supplier<byte[]> salts) {
        this.senderKeys = senderKeys;
        this.salts = salts;
    }

    static WebPushEncryption random() {
        SecureRandom random = new SecureRandom();
        return new WebPushEncryption(P256::generate, () -> {
            byte[] salt = new byte[SALT_BYTES];
            random.nextBytes(salt);
            return salt;
        });
    }

    byte[] encrypt(byte[] receiverPublic, byte[] authSecret, byte[] plaintext) {
        return encrypt(receiverPublic, authSecret, plaintext, 0);
    }

    byte[] encrypt(byte[] receiverPublic, byte[] authSecret, byte[] plaintext, int paddedLength) {
        if (plaintext.length > MAX_PLAINTEXT_BYTES || paddedLength > MAX_PLAINTEXT_BYTES + 1) {
            throw new IllegalArgumentException("A push message holds at most " + MAX_PLAINTEXT_BYTES + " bytes");
        }
        KeyPair sender = senderKeys.get();
        byte[] salt = salts.get();
        Derived derived = derive(sender, receiverPublic, authSecret, salt);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(derived.contentEncryptionKey(), "AES"), new GCMParameterSpec(TAG_BITS, derived.nonce()));
            byte[] padded = Arrays.copyOf(plaintext, Math.max(plaintext.length + 1, paddedLength));
            padded[plaintext.length] = LAST_RECORD_DELIMITER;
            byte[] ciphertext = cipher.doFinal(padded);
            byte[] senderPublic = P256.uncompressed((ECPublicKey) sender.getPublic());
            return ByteBuffer.allocate(HEADER_BYTES + ciphertext.length)
                    .put(salt).putInt(RECORD_SIZE).put((byte) senderPublic.length).put(senderPublic).put(ciphertext).array();
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("A push message could not be encrypted", failure);
        }
    }

    static Derived derive(KeyPair sender, byte[] receiverPublic, byte[] authSecret, byte[] salt) {
        ECPublicKey receiver = P256.publicKey(receiverPublic);
        byte[] senderPublic = P256.uncompressed((ECPublicKey) sender.getPublic());
        return derive(agree(sender.getPrivate(), receiver), P256.uncompressed(receiver), senderPublic, authSecret, salt);
    }

    static Derived derive(byte[] ecdhSecret, byte[] receiverPublic, byte[] senderPublic, byte[] authSecret, byte[] salt) {
        if (authSecret.length != AUTH_SECRET_BYTES || salt.length != SALT_BYTES) {
            throw new IllegalArgumentException("The authentication secret and the salt hold 16 bytes each");
        }
        try {
            byte[] ikm = hkdf(authSecret, ecdhSecret, concat(KEY_INFO, receiverPublic, senderPublic), 32);
            return new Derived(ecdhSecret, ikm, hkdf(salt, ikm, CEK_INFO, 16), hkdf(salt, ikm, NONCE_INFO, 12));
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("The push message keys could not be derived", failure);
        }
    }

    static byte[] agree(PrivateKey own, PublicKey other) {
        try {
            KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
            agreement.init(own);
            agreement.doPhase(other, true);
            return agreement.generateSecret();
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("The ECDH secret could not be agreed", failure);
        }
    }

    private static byte[] hkdf(byte[] salt, byte[] inputKeyingMaterial, byte[] info, int length) throws GeneralSecurityException {
        return KDF.getInstance("HKDF-SHA256").deriveData(HKDFParameterSpec.ofExtract().addSalt(salt).addIKM(inputKeyingMaterial).thenExpand(info, length));
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) {
            out.writeBytes(part);
        }
        return out.toByteArray();
    }

    record Derived(byte[] ecdhSecret, byte[] ikm, byte[] contentEncryptionKey, byte[] nonce) {
    }
}
