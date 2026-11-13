package cz.novanadeje.app.donors.infrastructure.config;

import cz.novanadeje.app.donors.application.AdministratorProperties;
import cz.novanadeje.app.donors.application.DonorEmailVerificationProperties;
import cz.novanadeje.app.donors.application.DonorPasswordResetProperties;
import cz.novanadeje.app.donors.application.DonorSecondFactorProperties;
import cz.novanadeje.app.donors.application.DonorSessionProperties;
import cz.novanadeje.app.donors.application.OAuthProperties;
import cz.novanadeje.app.donors.application.PasskeyProperties;
import cz.novanadeje.app.donors.application.RegistrationReminderProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("app.donors")
record DonorsApplicationProperties(
        @DefaultValue AdministratorProperties administrators,
        @DefaultValue DonorEmailVerificationProperties emailVerification,
        @DefaultValue DonorPasswordResetProperties passwordReset,
        @DefaultValue DonorSecondFactorProperties secondFactor,
        @DefaultValue DonorSessionProperties session,
        @DefaultValue RegistrationReminderProperties registrationReminder,
        @DefaultValue OAuthProperties oauth,
        @DefaultValue PasskeyProperties passkeys) {
}
