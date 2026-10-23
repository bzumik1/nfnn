package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.SecretSealer;
import cz.novanadeje.app.operations.domain.settings.Setting;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;

final class AesGcmSecretSealer implements SecretSealer {

    static final int KEY_BYTES = 32;
    private static final String VERSION = "v1:";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final Optional<SecretKeySpec> key;
    private final SecureRandom random = new SecureRandom();

    private AesGcmSecretSealer(Optional<SecretKeySpec> key) {
        this.key = key;
    }

    static AesGcmSecretSealer fromKey(String encodedKey) {
        if (encodedKey == null || encodedKey.isBlank()) {
            return new AesGcmSecretSealer(Optional.empty());
        }
        return new AesGcmSecretSealer(Optional.of(new SecretKeySpec(decodeKey(encodedKey), "AES")));
    }

    static byte[] decodeKey(String encodedKey) {
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(encodedKey.strip());
        } catch (IllegalArgumentException malformed) {
            throw new IllegalArgumentException("SETTINGS_KEY (app.operations.settings.key) must be Base64", malformed);
        }
        if (bytes.length != KEY_BYTES) {
            throw new IllegalArgumentException("SETTINGS_KEY (app.operations.settings.key) must hold " + KEY_BYTES + " bytes");
        }
        return bytes;
    }

    @Override
    public boolean available() {
        return key.isPresent();
    }

    @Override
    public String seal(Setting setting, String value) {
        SecretKeySpec secretKey = key.orElseThrow(() -> new IllegalStateException("No settings key to seal with"));
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(setting.name().getBytes(StandardCharsets.US_ASCII));
            byte[] sealed = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            return VERSION + Base64.getEncoder().encodeToString(ByteBuffer.allocate(IV_BYTES + sealed.length).put(iv).put(sealed).array());
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("A setting could not be sealed", failure);
        }
    }

    @Override
    public Optional<String> unseal(Setting setting, String sealed) {
        if (key.isEmpty() || sealed == null || !sealed.startsWith(VERSION)) {
            return Optional.empty();
        }
        try {
            byte[] bytes = Base64.getDecoder().decode(sealed.substring(VERSION.length()));
            if (bytes.length <= IV_BYTES) {
                return Optional.empty();
            }
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key.get(), new GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES));
            cipher.updateAAD(setting.name().getBytes(StandardCharsets.US_ASCII));
            return Optional.of(new String(cipher.doFinal(bytes, IV_BYTES, bytes.length - IV_BYTES), StandardCharsets.UTF_8));
        } catch (GeneralSecurityException | IllegalArgumentException unreadable) {
            return Optional.empty();
        }
    }
}
