package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

@TestConfiguration(proxyBeanMethods = false)
@Import({TestcontainersConfiguration.class, JpaAuthorizationCodeRepository.class, JpaDonorRepository.class, JpaEmailVerificationTokenRepository.class,
        JpaPasskeyChallengeRepository.class, JpaPasskeyRepository.class, JpaPasswordResetTokenRepository.class, JpaRefreshTokenRepository.class,
        JpaRegistrationReminders.class, JpaSecondFactorChallengeRepository.class, JpaSecondFactorRecoveryRepository.class, JpaSecondFactorRepository.class})
class DonorsPersistenceTestConfiguration {
}
