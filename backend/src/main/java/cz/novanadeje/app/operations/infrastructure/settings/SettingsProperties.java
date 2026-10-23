package cz.novanadeje.app.operations.infrastructure.settings;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.operations.settings")
record SettingsProperties(boolean fromDatabase, String key) {

    SettingsProperties {
        key = key == null || key.isBlank() ? null : key.strip();
        if (key != null) {
            AesGcmSecretSealer.decodeKey(key);
        }
    }

    @Override
    public String toString() {
        return "SettingsProperties[fromDatabase=" + fromDatabase + ", key=" + (key == null ? "none" : "********") + "]";
    }
}
