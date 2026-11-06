package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;

import java.time.Instant;
import java.util.Optional;

record SettingRow(String name, String value, boolean sealed, Instant updatedAt) {

    Optional<StoredSetting> toDomain() {
        return Setting.named(name).map(setting -> new StoredSetting(setting, value, sealed, updatedAt));
    }
}
