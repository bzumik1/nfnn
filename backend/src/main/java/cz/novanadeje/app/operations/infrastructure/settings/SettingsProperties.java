package cz.novanadeje.app.operations.infrastructure.settings;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

@ConfigurationProperties("app.operations.settings")
record SettingsProperties(boolean fromDatabase, String key, Path tunnelDirectory) {

    SettingsProperties {
        key = key == null || key.isBlank() ? null : key.strip();
        if (key != null) {
            AesGcmSecretSealer.decodeKey(key);
        }
        if (tunnelDirectory == null) {
            throw new IllegalArgumentException("app.operations.settings.tunnel-directory is required");
        }
    }

    @Override
    public String toString() {
        return "SettingsProperties[fromDatabase=" + fromDatabase + ", key=" + (key == null ? "none" : "********") + ", tunnelDirectory="
                + tunnelDirectory + "]";
    }
}
