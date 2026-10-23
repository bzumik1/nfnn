package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingsRepository;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
class JpaSettingsRepository implements SettingsRepository {

    private final SettingJpaRepository jpa;

    JpaSettingsRepository(SettingJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public List<StoredSetting> findAll() {
        return jpa.findAll().stream().map(SettingJpaEntity::toDomain).flatMap(Optional::stream).toList();
    }

    @Override
    public void save(StoredSetting setting) {
        jpa.save(SettingJpaEntity.fromDomain(setting));
    }

    @Override
    public void delete(Setting setting) {
        jpa.deleteById(setting.name());
    }
}
