package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.backup.BackupKey;

import java.util.Optional;

public final class PublicDevelopmentKeys {

    public static final String DEVELOPMENT_PROFILE = "dev";

    private PublicDevelopmentKeys() {
    }

    public static PublicDevelopmentKeys ofDevelopmentProfile() {
        return new PublicDevelopmentKeys();
    }

    public Optional<BackupKey> backupKey() {
        return Optional.empty();
    }

    public boolean isSettingsKey(String value) {
        return false;
    }

    public boolean isBackupKey(String value) {
        return false;
    }
}
