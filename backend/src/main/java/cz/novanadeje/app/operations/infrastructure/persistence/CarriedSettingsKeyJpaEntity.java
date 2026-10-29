package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "operations_carried_settings_key")
class CarriedSettingsKeyJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "wrapped", nullable = false, length = CarriedSettingsKey.MAX_LENGTH)
    private String wrapped;

    @Column(name = "stored_at", nullable = false)
    private Instant storedAt;

    protected CarriedSettingsKeyJpaEntity() {
    }

    static CarriedSettingsKeyJpaEntity fromDomain(CarriedSettingsKey key) {
        CarriedSettingsKeyJpaEntity entity = new CarriedSettingsKeyJpaEntity();
        entity.id = SINGLETON_ID;
        entity.wrapped = key.wrapped();
        entity.storedAt = key.storedAt();
        return entity;
    }

    CarriedSettingsKey toDomain() {
        return new CarriedSettingsKey(wrapped, storedAt);
    }
}
