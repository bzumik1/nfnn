package cz.novanadeje.app.operations.infrastructure.settings;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.Profiles;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class DevelopmentKeysGuard implements EnvironmentPostProcessor, Ordered {

    static final String PRODUCTION_PROFILE = "prod";
    private static final String SETTINGS_KEY = "SETTINGS_KEY (" + PublicDevelopmentKeys.SETTINGS_KEY_PROPERTY + ")";
    private static final String BACKUP_KEY = "BACKUP_KEY (" + PublicDevelopmentKeys.BACKUP_KEY_PROPERTY + ")";
    private static final String JWT_SECRET = "JWT_SECRET (" + PublicDevelopmentKeys.JWT_SECRET_PROPERTY + ")";
    private static final String PUBLIC_VALUES = "Outside development the backend refuses the public values of the development profile "
            + "(application-dev.yml), and these variables hold one: ";
    private static final String OWN_SECRETS = "; give the server secrets of its own (deploy/README.md, section Hesla a nastavení serveru)";

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE - 1;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        boolean development = environment.acceptsProfiles(Profiles.of(PublicDevelopmentKeys.DEVELOPMENT_PROFILE));
        List<String> active = Arrays.asList(environment.getActiveProfiles());
        boolean developmentWithProduction = development && environment.acceptsProfiles(Profiles.of(PRODUCTION_PROFILE));
        boolean exactlyProduction = active.equals(List.of(PRODUCTION_PROFILE));
        if (developmentWithProduction || !development && !exactlyProduction) {
            throw new IllegalStateException("The backend runs either in development or with exactly the prod profile (SPRING_PROFILES_ACTIVE=prod), "
                    + "but the active profiles are " + active);
        }
        if (development) {
            return;
        }
        PublicDevelopmentKeys publicKeys = PublicDevelopmentKeys.ofDevelopmentProfile();
        List<String> publicValues = new ArrayList<>();
        if (publicKeys.isSettingsKey(environment.getProperty(PublicDevelopmentKeys.SETTINGS_KEY_PROPERTY))) {
            publicValues.add(SETTINGS_KEY);
        }
        if (publicKeys.isBackupKey(environment.getProperty(PublicDevelopmentKeys.BACKUP_KEY_PROPERTY))) {
            publicValues.add(BACKUP_KEY);
        }
        if (publicKeys.isJwtSecret(environment.getProperty(PublicDevelopmentKeys.JWT_SECRET_PROPERTY))) {
            publicValues.add(JWT_SECRET);
        }
        if (!publicValues.isEmpty()) {
            throw new IllegalStateException(PUBLIC_VALUES + String.join(", ", publicValues) + OWN_SECRETS);
        }
    }
}
