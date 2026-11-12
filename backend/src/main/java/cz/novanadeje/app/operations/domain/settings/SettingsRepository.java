package cz.novanadeje.app.operations.domain.settings;

import java.util.List;

public interface SettingsRepository {

    void lockForChange();

    List<StoredSetting> findAll();

    void save(StoredSetting setting);

    void delete(Setting setting);
}
