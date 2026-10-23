package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.CurrentSettings;
import cz.novanadeje.app.operations.domain.settings.Setting;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
class EnvironmentCurrentSettings implements CurrentSettings {

    private final Environment environment;

    EnvironmentCurrentSettings(Environment environment) {
        this.environment = environment;
    }

    @Override
    public Optional<String> effectiveValue(Setting setting) {
        return Optional.ofNullable(environment.getProperty(SettingProperties.runningProperty(setting)));
    }
}
