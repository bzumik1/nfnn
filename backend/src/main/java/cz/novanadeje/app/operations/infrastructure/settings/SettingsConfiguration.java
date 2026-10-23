package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.SecretSealer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class SettingsConfiguration {

    @Bean
    SecretSealer secretSealer(SettingsProperties properties) {
        return AesGcmSecretSealer.fromKey(properties.key());
    }
}
