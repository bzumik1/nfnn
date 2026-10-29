package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.backup.BackupKeySource;
import cz.novanadeje.app.operations.application.settings.SecretSealer;
import cz.novanadeje.app.operations.application.settings.SettingsKeyCarrier;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class SettingsConfiguration {

    @Bean
    SecretSealer secretSealer(SettingsProperties properties) {
        return AesGcmSecretSealer.fromKey(properties.key());
    }

    @Bean
    SettingsKeyCarrier settingsKeyCarrier(SettingsProperties properties, BackupKeySource backupKeys) {
        return BackupKeySettingsKeyCarrier.of(properties.key(), backupKeys.current().map(BackupKey::value).orElse(null));
    }
}
