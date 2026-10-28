package cz.novanadeje.app.operations.domain.backup;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public record BackupKeyConfirmation(String keyFingerprint, Instant confirmedAt, Optional<UUID> confirmedBy) {

    public static final int FINGERPRINT_LENGTH = 64;

    public BackupKeyConfirmation {
        if (keyFingerprint == null || keyFingerprint.length() != FINGERPRINT_LENGTH) {
            throw new IllegalArgumentException("A confirmation names the key by its SHA-256 fingerprint");
        }
        Objects.requireNonNull(confirmedAt, "confirmedAt");
        Objects.requireNonNull(confirmedBy, "confirmedBy");
    }

    public static BackupKeyConfirmation of(BackupKey key, Instant confirmedAt, Optional<UUID> confirmedBy) {
        return new BackupKeyConfirmation(key.fingerprint(), confirmedAt, confirmedBy);
    }

    public boolean confirms(BackupKey key) {
        return keyFingerprint.equals(key.fingerprint());
    }
}
