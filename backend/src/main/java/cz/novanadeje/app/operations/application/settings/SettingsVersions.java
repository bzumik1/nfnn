package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import cz.novanadeje.app.shared.application.version.RowVersions;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

@Component
public class SettingsVersions {

    private final RowVersions versions;

    public SettingsVersions(RowVersions versions) {
        this.versions = versions;
    }

    public String of(StoredSettings stored) {
        return versions.versionOf(List.of(stored));
    }

    public record StoredSettings(List<StoredSettingRow> settings) {

        public StoredSettings {
            settings = List.copyOf(settings);
        }

        public static StoredSettings of(List<StoredSetting> stored) {
            return new StoredSettings(stored.stream()
                    .filter(row -> row.setting().isAdministered())
                    .map(StoredSettingRow::of)
                    .sorted(Comparator.comparing(StoredSettingRow::name))
                    .toList());
        }
    }

    public record StoredSettingRow(String name, String value, boolean sealed, Instant updatedAt) {

        static StoredSettingRow of(StoredSetting stored) {
            return new StoredSettingRow(stored.setting().name(), stored.sealed() ? null : stored.value(), stored.sealed(), stored.updatedAt());
        }
    }
}
