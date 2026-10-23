package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingsRepository;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

class InMemorySettingsRepository implements SettingsRepository {

    private final Map<Setting, StoredSetting> rows = new EnumMap<>(Setting.class);

    @Override
    public List<StoredSetting> findAll() {
        return new ArrayList<>(rows.values());
    }

    @Override
    public void save(StoredSetting setting) {
        rows.put(setting.setting(), setting);
    }

    @Override
    public void delete(Setting setting) {
        rows.remove(setting);
    }

    Optional<StoredSetting> find(Setting setting) {
        return Optional.ofNullable(rows.get(setting));
    }
}
