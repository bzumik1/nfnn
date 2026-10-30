package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.InvalidBackupKey;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertyResolver;
import org.springframework.core.env.PropertySourcesPropertyResolver;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.security.MessageDigest;
import java.util.Optional;
import java.util.function.Function;

public final class PublicDevelopmentKeys {

    public static final String DEVELOPMENT_PROFILE = "dev";
    static final String SETTINGS_KEY_PROPERTY = "app.operations.settings.key";
    static final String BACKUP_KEY_PROPERTY = "app.operations.backup-key.value";
    static final String JWT_SECRET_PROPERTY = "app.security.jwt.secret";
    private static final String DEVELOPMENT_CONFIGURATION = "application-" + DEVELOPMENT_PROFILE + ".yml";

    private final byte[] settingsKey;
    private final BackupKey backupKey;
    private final String jwtSecret;

    private PublicDevelopmentKeys(byte[] settingsKey, BackupKey backupKey, String jwtSecret) {
        this.settingsKey = settingsKey;
        this.backupKey = backupKey;
        this.jwtSecret = jwtSecret;
    }

    public static PublicDevelopmentKeys ofDevelopmentProfile() {
        return of(new PropertySourcesPropertyResolver(developmentConfiguration()));
    }

    static PublicDevelopmentKeys of(PropertyResolver defaults) {
        return new PublicDevelopmentKeys(
                required(defaults, SETTINGS_KEY_PROPERTY, PublicDevelopmentKeys::settingsKeyBytes),
                required(defaults, BACKUP_KEY_PROPERTY, PublicDevelopmentKeys::backupKeyOf),
                required(defaults, JWT_SECRET_PROPERTY, PublicDevelopmentKeys::stripped));
    }

    public BackupKey backupKey() {
        return backupKey;
    }

    public boolean isSettingsKey(String value) {
        return settingsKeyBytes(value).filter(bytes -> MessageDigest.isEqual(bytes, settingsKey)).isPresent();
    }

    public boolean isJwtSecret(String value) {
        return stripped(value).filter(jwtSecret::equals).isPresent();
    }

    public boolean isBackupKey(String value) {
        return backupKeyOf(value).filter(backupKey::equals).isPresent();
    }

    private static <T> T required(PropertyResolver defaults, String property, Function<String, Optional<T>> reader) {
        return developmentValue(defaults, property).flatMap(reader).orElseThrow(() -> unusable(property));
    }

    private static Optional<String> developmentValue(PropertyResolver defaults, String property) {
        try {
            return Optional.ofNullable(defaults.getProperty(property));
        } catch (IllegalArgumentException unresolvable) {
            throw unusable(property);
        }
    }

    private static IllegalStateException unusable(String property) {
        return new IllegalStateException(DEVELOPMENT_CONFIGURATION + " gives " + property + " no usable default, so the backend cannot tell "
                + "that public value from a server's own and does not start; restore the default in " + DEVELOPMENT_CONFIGURATION);
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

    private static Optional<String> stripped(String value) {
        return value == null || value.isBlank() ? Optional.empty() : Optional.of(value.strip());
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
