package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingsRepository;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
class JpaSettingsRepository implements SettingsRepository {

    private final SettingJpaRepository jpa;
    private final EntityManager entityManager;

    JpaSettingsRepository(SettingJpaRepository jpa, EntityManager entityManager) {
        this.jpa = jpa;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockForChange() {
        AdvisoryLock.SETTINGS_CHANGES.acquireFor(entityManager);
    }

    @Override
    public List<StoredSetting> findAll() {
        return jpa.findAllRows().stream().map(SettingRow::toDomain).flatMap(Optional::stream).toList();
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
