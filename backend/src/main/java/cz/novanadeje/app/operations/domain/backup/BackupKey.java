package cz.novanadeje.app.operations.domain.backup;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

public record BackupKey(String value) {

    public static final int MAX_LENGTH = 100;
    public static final int CHECK_LENGTH = 4;

    private static final String HUMAN_READABLE_PART = "age-secret-key-";
    private static final int KEY_BYTES = 32;

    public BackupKey {
        if (value == null) {
            throw new InvalidBackupKey();
        }
        value = value.strip().toUpperCase(Locale.ROOT);
        if (value.length() > MAX_LENGTH || !Bech32.holds(value, HUMAN_READABLE_PART, KEY_BYTES)) {
            throw new InvalidBackupKey();
        }
    }

    public String lastCharacters() {
        return value.substring(value.length() - CHECK_LENGTH);
    }

    public boolean matchesCheck(String typed) {
        return typed != null && typed.strip().toUpperCase(Locale.ROOT).equals(lastCharacters());
    }

    public String fingerprint() {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is part of every Java platform", missing);
        }
    }

    @Override
    public String toString() {
        return "BackupKey[********]";
    }
}
