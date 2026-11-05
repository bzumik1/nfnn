package cz.novanadeje.app.operations.infrastructure.push;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.util.Arrays;

public final class WebPushDecryption {

    private WebPushDecryption() {
    }

    public static byte[] decrypt(byte[] body, byte[] receiverPrivate, byte[] receiverPublic, byte[] authSecret) {
        ByteBuffer header = ByteBuffer.wrap(body);
        byte[] salt = new byte[WebPushEncryption.SALT_BYTES];
        header.get(salt);
        if (header.getInt() != WebPushEncryption.RECORD_SIZE || header.get() != P256.UNCOMPRESSED_BYTES) {
            throw new IllegalArgumentException("Not an aes128gcm body of one record with a P-256 key id");
        }
        byte[] senderPublic = new byte[P256.UNCOMPRESSED_BYTES];
        header.get(senderPublic);
        KeyPair receiver = P256.keyPair(receiverPrivate, receiverPublic);
        byte[] ecdhSecret = WebPushEncryption.agree(receiver.getPrivate(), P256.publicKey(senderPublic));
        WebPushEncryption.Derived derived = WebPushEncryption.derive(ecdhSecret, receiverPublic, senderPublic, authSecret, salt);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(derived.contentEncryptionKey(), "AES"), new GCMParameterSpec(128, derived.nonce()));
            byte[] padded = cipher.doFinal(body, WebPushEncryption.HEADER_BYTES, body.length - WebPushEncryption.HEADER_BYTES);
            int delimiter = padded.length - 1;
            while (delimiter > 0 && padded[delimiter] == 0) {
                delimiter--;
            }
            if (padded[delimiter] != 0x02) {
                throw new IllegalArgumentException("The record does not end with the last-record delimiter and zero padding");
            }
            return Arrays.copyOf(padded, delimiter);
        } catch (GeneralSecurityException failure) {
            throw new IllegalArgumentException("The body cannot be decrypted", failure);
        }
    }
}
