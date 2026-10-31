package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKeyRepository;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.seal.SealVerdict;

import javax.crypto.KDF;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.HKDFParameterSpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Optional;

final class SettingsKeyRecordSeals implements RecordSeals {

    private static final String VERSION = "v1:";
    private static final byte[] INFO = "nfnn.cz/record-seal/v1".getBytes(StandardCharsets.US_ASCII);
    private static final String MAC = "HmacSHA256";
    private static final int MAC_KEY_BYTES = 32;

    private final BackupKeySettingsKeyCarrier carrier;
    private final CarriedSettingsKeyRepository carried;

    SettingsKeyRecordSeals(BackupKeySettingsKeyCarrier carrier, CarriedSettingsKeyRepository carried) {
        this.carrier = carrier;
        this.carried = carried;
    }

    @Override
    public String seal(String purpose, byte[] content) {
        byte[] settingsKey = carrier.settingsKey().orElseThrow(() -> new IllegalStateException("No settings key to seal a record with"));
        return VERSION + Base64.getEncoder().encodeToString(mac(settingsKey, purpose, content));
    }

    @Override
    public SealVerdict check(String purpose, byte[] content, String seal) {
        Optional<byte[]> expected = decoded(seal);
        if (expected.isEmpty()) {
            return SealVerdict.BROKEN;
        }
        if (carrier.settingsKey().filter(key -> matches(key, purpose, content, expected.get())).isPresent()) {
            return SealVerdict.SEALED_HERE;
        }
        boolean carriedKeyMatches = carried.find().filter(key -> !carrier.carriesCurrentKey(key)).flatMap(carrier::unwrap)
                .filter(key -> matches(key, purpose, content, expected.get())).isPresent();
        return carriedKeyMatches ? SealVerdict.SEALED_BY_CARRIED_KEY : SealVerdict.BROKEN;
    }

    private static boolean matches(byte[] settingsKey, String purpose, byte[] content, byte[] expected) {
        return MessageDigest.isEqual(mac(settingsKey, purpose, content), expected);
    }

    private static Optional<byte[]> decoded(String seal) {
        if (seal == null || !seal.startsWith(VERSION)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Base64.getDecoder().decode(seal.substring(VERSION.length())));
        } catch (IllegalArgumentException notBase64) {
            return Optional.empty();
        }
    }

    private static byte[] mac(byte[] settingsKey, String purpose, byte[] content) {
        try {
            SecretKey key = KDF.getInstance("HKDF-SHA256")
                    .deriveKey("HmacSHA256", HKDFParameterSpec.ofExtract().addIKM(settingsKey).thenExpand(INFO, MAC_KEY_BYTES));
            Mac mac = Mac.getInstance(MAC);
            mac.init(key);
            mac.update(purpose.getBytes(StandardCharsets.UTF_8));
            mac.update((byte) 0);
            return mac.doFinal(content);
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("HKDF-SHA256 and HMAC-SHA256 are part of every Java 25 platform", failure);
        }
    }
}
