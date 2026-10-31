package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.backup.BackupKeySource;
import cz.novanadeje.app.operations.application.settings.SecretSealer;
import cz.novanadeje.app.operations.application.settings.SettingsKeyCarrier;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKeyRepository;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
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
        return carrier(properties, backupKeys);
    }

    @Bean
    RecordSeals recordSeals(SettingsProperties properties, BackupKeySource backupKeys, CarriedSettingsKeyRepository carried) {
        return new SettingsKeyRecordSeals(carrier(properties, backupKeys), carried);
    }

    private static BackupKeySettingsKeyCarrier carrier(SettingsProperties properties, BackupKeySource backupKeys) {
        return BackupKeySettingsKeyCarrier.of(properties.key(), backupKeys.current().map(BackupKey::value).orElse(null));
    }
}
