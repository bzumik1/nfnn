package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;

@Entity
@Table(name = "operations_setting")
public class SettingJpaEntity {

    static final int MAX_NAME_LENGTH = 64;
    static final int MAX_VALUE_LENGTH = 4000;

    @Id
    @Column(name = "name", length = MAX_NAME_LENGTH)
    private String name;

    @Column(name = "value", length = MAX_VALUE_LENGTH, nullable = false)
    private String value;

    @Column(name = "sealed", nullable = false)
    private boolean sealed;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected SettingJpaEntity() {
    }

    static SettingJpaEntity fromDomain(StoredSetting setting) {
        SettingJpaEntity entity = new SettingJpaEntity();
        entity.name = setting.setting().name();
        entity.value = setting.value();
        entity.sealed = setting.sealed();
        entity.updatedAt = setting.updatedAt();
        return entity;
    }

    Optional<StoredSetting> toDomain() {
        return Setting.named(name).map(setting -> new StoredSetting(setting, value, sealed, updatedAt));
    }
}
