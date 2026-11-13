package cz.novanadeje.app.donors.infrastructure.config;

import cz.novanadeje.app.donors.application.AdministratorProperties;
import cz.novanadeje.app.donors.application.DonorEmailVerificationProperties;
import cz.novanadeje.app.donors.application.DonorPasswordResetProperties;
import cz.novanadeje.app.donors.application.DonorSecondFactorProperties;
import cz.novanadeje.app.donors.application.DonorSessionProperties;
import cz.novanadeje.app.donors.application.OAuthProperties;
import cz.novanadeje.app.donors.application.PasskeyProperties;
import cz.novanadeje.app.donors.application.RegistrationReminderProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(DonorsApplicationProperties.class)
public class DonorsApplicationConfiguration {

    @Bean
    AdministratorProperties administratorProperties(DonorsApplicationProperties properties) {
        return properties.administrators();
    }

    @Bean
    DonorEmailVerificationProperties donorEmailVerificationProperties(DonorsApplicationProperties properties) {
        return properties.emailVerification();
    }

    @Bean
    DonorPasswordResetProperties donorPasswordResetProperties(DonorsApplicationProperties properties) {
        return properties.passwordReset();
    }

    @Bean
    DonorSecondFactorProperties donorSecondFactorProperties(DonorsApplicationProperties properties) {
        return properties.secondFactor();
    }

    @Bean
    DonorSessionProperties donorSessionProperties(DonorsApplicationProperties properties) {
        return properties.session();
    }

    @Bean
    RegistrationReminderProperties registrationReminderProperties(DonorsApplicationProperties properties) {
        return properties.registrationReminder();
    }

    @Bean
    OAuthProperties oAuthProperties(DonorsApplicationProperties properties) {
        return properties.oauth();
    }

    @Bean
    PasskeyProperties passkeyProperties(DonorsApplicationProperties properties) {
        return properties.passkeys();
    }
}
