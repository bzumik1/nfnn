package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

@TestConfiguration(proxyBeanMethods = false)
@Import({TestcontainersConfiguration.class, JpaBackupAlertStateRepository.class, JpaBackupKeyConfirmationRepository.class, JpaBackupScheduleRepository.class,
        JpaCarriedSettingsKeyRepository.class, JpaRestoreRecordRepository.class, JpaSettingsRepository.class, JpaSetupStateRepository.class})
class OperationsPersistenceTestConfiguration {
}
