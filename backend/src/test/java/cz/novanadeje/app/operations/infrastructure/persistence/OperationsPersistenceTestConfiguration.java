package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

@TestConfiguration(proxyBeanMethods = false)
@Import({JpaBackupAlertStateRepository.class, JpaBackupKeyConfirmationRepository.class, JpaBackupScheduleRepository.class,
        JpaCarriedSettingsKeyRepository.class, JpaDonorPushSubscriptionRepository.class, JpaOperationalAlertRepository.class, JpaPushKeyRepository.class, JpaPushSubscriptionRepository.class,
        JpaRestoreRecordRepository.class, JpaSettingsRepository.class, JpaSetupStateRepository.class})
public class OperationsPersistenceTestConfiguration {
}
