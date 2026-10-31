package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.SecretSealer;
import cz.novanadeje.app.operations.application.settings.SettingsKeyCarrier;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.InvalidBackupKey;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;

import javax.crypto.Cipher;
import javax.crypto.KDF;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.HKDFParameterSpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

final class BackupKeySettingsKeyCarrier implements SettingsKeyCarrier {

    private static final String VERSION = "v1:";
    private static final byte[] INFO = "nfnn.cz/carried-settings-key/v1".getBytes(StandardCharsets.US_ASCII);
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final Optional<byte[]> settingsKey;
    private final Optional<SecretKey> wrappingKey;
    private final SecureRandom random = new SecureRandom();

    private BackupKeySettingsKeyCarrier(Optional<byte[]> settingsKey, Optional<SecretKey> wrappingKey) {
        this.settingsKey = settingsKey;
        this.wrappingKey = wrappingKey;
    }

    static BackupKeySettingsKeyCarrier of(String settingsKey, String backupKey) {
        Optional<byte[]> settings = settingsKey == null || settingsKey.isBlank()
                ? Optional.empty()
                : Optional.of(AesGcmSecretSealer.decodeKey(settingsKey));
        return new BackupKeySettingsKeyCarrier(settings, wrappingKeyOf(backupKey));
    }

    @Override
    public boolean available() {
        return settingsKey.isPresent() && wrappingKey.isPresent();
    }

    @Override
    public CarriedSettingsKey carryCurrentKey(Instant at) {
        byte[] key = settingsKey.orElseThrow(() -> new IllegalStateException("No settings key to carry"));
        SecretKey wrapping = wrappingKey.orElseThrow(() -> new IllegalStateException("No backup key to carry the settings key under"));
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, wrapping, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(INFO);
            byte[] wrapped = cipher.doFinal(key);
            return new CarriedSettingsKey(VERSION + Base64.getEncoder().encodeToString(
                    ByteBuffer.allocate(IV_BYTES + wrapped.length).put(iv).put(wrapped).array()), at);
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("The settings key could not be carried", failure);
        }
    }

    @Override
    public boolean carriesCurrentKey(CarriedSettingsKey carried) {
        return settingsKey.isPresent() && unwrap(carried).filter(key -> MessageDigest.isEqual(key, settingsKey.get())).isPresent();
    }

    @Override
    public Optional<SecretSealer> sealerOf(CarriedSettingsKey carried) {
        return unwrap(carried).map(key -> AesGcmSecretSealer.fromKey(Base64.getEncoder().encodeToString(key)));
    }

    Optional<byte[]> settingsKey() {
        return settingsKey.map(byte[]::clone);
    }

    Optional<byte[]> unwrap(CarriedSettingsKey carried) {
        if (wrappingKey.isEmpty() || !carried.wrapped().startsWith(VERSION)) {
            return Optional.empty();
        }
        try {
            byte[] bytes = Base64.getDecoder().decode(carried.wrapped().substring(VERSION.length()));
            if (bytes.length <= IV_BYTES) {
                return Optional.empty();
            }
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, wrappingKey.get(), new GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES));
            cipher.updateAAD(INFO);
            byte[] key = cipher.doFinal(bytes, IV_BYTES, bytes.length - IV_BYTES);
            return key.length == AesGcmSecretSealer.KEY_BYTES ? Optional.of(key) : Optional.empty();
        } catch (GeneralSecurityException | IllegalArgumentException unreadable) {
            return Optional.empty();
        }
    }

    private static Optional<SecretKey> wrappingKeyOf(String backupKey) {
        if (backupKey == null || backupKey.isBlank()) {
            return Optional.empty();
        }
        try {
            byte[] material = new BackupKey(backupKey).value().getBytes(StandardCharsets.US_ASCII);
            return Optional.of(KDF.getInstance("HKDF-SHA256")
                    .deriveKey("AES", HKDFParameterSpec.ofExtract().addIKM(material).thenExpand(INFO, AesGcmSecretSealer.KEY_BYTES)));
        } catch (InvalidBackupKey invalid) {
            return Optional.empty();
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("HKDF-SHA256 is part of every Java 25 platform", failure);
        }
    }
}
