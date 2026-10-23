package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsKeyMissing;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.operations.domain.settings.SettingsRepository;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class SettingsWriter {

    private final SettingsRepository repository;
    private final SecretSealer sealer;
    private final SettingsValidator validator;

    public SettingsWriter(SettingsRepository repository, SecretSealer sealer, SettingsValidator validator) {
        this.repository = repository;
        this.sealer = sealer;
        this.validator = validator;
    }

    public Map<Setting, String> storedValues() {
        Map<Setting, String> values = new EnumMap<>(Setting.class);
        for (StoredSetting stored : repository.findAll()) {
            readable(stored).ifPresent(value -> values.put(stored.setting(), value));
        }
        return values;
    }

    public List<Setting> unreadable() {
        return repository.findAll().stream().filter(stored -> readable(stored).isEmpty()).map(StoredSetting::setting).toList();
    }

    public List<Setting> apply(List<SettingChange> requested, List<Setting> required, Instant now) {
        Map<Setting, SettingChange> changes = new LinkedHashMap<>();
        requested.forEach(change -> changes.put(change.setting(), change));
        Map<Setting, String> stored = storedValues();
        Map<Setting, String> candidate = new EnumMap<>(stored);
        List<SettingError> errors = new ArrayList<>();
        for (SettingChange change : changes.values()) {
            if (change.resetsToDefault()) {
                candidate.remove(change.setting());
            } else {
                change.setting().check(change.value()).ifPresent(problem -> errors.add(SettingError.of(change.setting(), problem)));
                candidate.put(change.setting(), change.value());
            }
        }
        for (Setting setting : required) {
            if (!candidate.containsKey(setting) && errors.stream().noneMatch(error -> error.setting().equals(Optional.of(setting)))) {
                errors.add(SettingError.of(setting, SettingProblem.REQUIRED));
            }
        }
        if (errors.isEmpty()) {
            errors.addAll(validator.validate(stored, candidate, changes.keySet()));
        }
        if (!errors.isEmpty()) {
            throw new SettingsRejected(errors);
        }
        boolean sealsSecret = changes.values().stream().anyMatch(change -> change.setting().secret() && !change.resetsToDefault());
        if (sealsSecret && !sealer.available()) {
            throw new SettingsKeyMissing();
        }
        for (SettingChange change : changes.values()) {
            if (change.resetsToDefault()) {
                repository.delete(change.setting());
            } else if (change.setting().secret()) {
                repository.save(new StoredSetting(change.setting(), sealer.seal(change.setting(), change.value()), true, now));
            } else {
                repository.save(new StoredSetting(change.setting(), change.value(), false, now));
            }
        }
        return List.copyOf(changes.keySet());
    }

    private Optional<String> readable(StoredSetting stored) {
        return stored.sealed() ? sealer.unseal(stored.setting(), stored.value()) : Optional.of(stored.value());
    }
}
