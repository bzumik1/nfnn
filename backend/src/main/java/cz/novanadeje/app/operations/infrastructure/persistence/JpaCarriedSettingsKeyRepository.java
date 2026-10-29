package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKeyRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaCarriedSettingsKeyRepository implements CarriedSettingsKeyRepository {

    private final CarriedSettingsKeyJpaRepository jpa;

    JpaCarriedSettingsKeyRepository(CarriedSettingsKeyJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<CarriedSettingsKey> find() {
        return jpa.findById(CarriedSettingsKeyJpaEntity.SINGLETON_ID).map(CarriedSettingsKeyJpaEntity::toDomain);
    }

    @Override
    public void save(CarriedSettingsKey key) {
        jpa.save(CarriedSettingsKeyJpaEntity.fromDomain(key));
    }
}
