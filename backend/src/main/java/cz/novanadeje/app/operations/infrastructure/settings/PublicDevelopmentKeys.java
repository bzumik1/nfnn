package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.InvalidBackupKey;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySourcesPropertyResolver;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.security.MessageDigest;
import java.util.Optional;

public final class PublicDevelopmentKeys {

    public static final String DEVELOPMENT_PROFILE = "dev";
    static final String SETTINGS_KEY_PROPERTY = "app.operations.settings.key";
    static final String BACKUP_KEY_PROPERTY = "app.operations.backup-key.value";
    private static final String DEVELOPMENT_CONFIGURATION = "application-" + DEVELOPMENT_PROFILE + ".yml";

    private final Optional<byte[]> settingsKey;
    private final Optional<BackupKey> backupKey;

    private PublicDevelopmentKeys(Optional<byte[]> settingsKey, Optional<BackupKey> backupKey) {
        this.settingsKey = settingsKey;
        this.backupKey = backupKey;
    }

    public static PublicDevelopmentKeys ofDevelopmentProfile() {
        PropertySourcesPropertyResolver defaults = new PropertySourcesPropertyResolver(developmentConfiguration());
        return new PublicDevelopmentKeys(
                Optional.ofNullable(defaults.getProperty(SETTINGS_KEY_PROPERTY)).flatMap(PublicDevelopmentKeys::settingsKeyBytes),
                Optional.ofNullable(defaults.getProperty(BACKUP_KEY_PROPERTY)).flatMap(PublicDevelopmentKeys::backupKeyOf));
    }

    public Optional<BackupKey> backupKey() {
        return backupKey;
    }

    public boolean isSettingsKey(String value) {
        return settingsKey.isPresent() && settingsKeyBytes(value).filter(bytes -> MessageDigest.isEqual(bytes, settingsKey.get())).isPresent();
    }

    public boolean isBackupKey(String value) {
        return backupKey.isPresent() && backupKeyOf(value).filter(backupKey.get()::equals).isPresent();
    }

    private static MutablePropertySources developmentConfiguration() {
        MutablePropertySources sources = new MutablePropertySources();
        try {
            new YamlPropertySourceLoader().load(DEVELOPMENT_CONFIGURATION, new ClassPathResource(DEVELOPMENT_CONFIGURATION)).forEach(sources::addLast);
        } catch (IOException unreadable) {
            throw new UncheckedIOException("The development configuration " + DEVELOPMENT_CONFIGURATION + " could not be read", unreadable);
        }
        return sources;
    }

    private static Optional<byte[]> settingsKeyBytes(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(AesGcmSecretSealer.decodeKey(value.strip()));
        } catch (IllegalArgumentException malformed) {
            return Optional.empty();
        }
    }

    private static Optional<BackupKey> backupKeyOf(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(new BackupKey(value));
        } catch (InvalidBackupKey malformed) {
            return Optional.empty();
        }
    }
}
