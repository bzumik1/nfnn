package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupLimits;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class BackupConfiguration {

    @Bean
    BackupLimits backupLimits(BackupProperties properties) {
        return properties.limits();
    }
}
