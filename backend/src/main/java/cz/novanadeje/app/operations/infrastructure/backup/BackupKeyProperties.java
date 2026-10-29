package cz.novanadeje.app.operations.infrastructure.backup;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.operations.backup-key")
record BackupKeyProperties(String value) {

    BackupKeyProperties {
        value = value == null || value.isBlank() ? null : value.strip();
    }

    @Override
    public String toString() {
        return "BackupKeyProperties[value=" + (value == null ? "none" : "********") + "]";
    }
}
