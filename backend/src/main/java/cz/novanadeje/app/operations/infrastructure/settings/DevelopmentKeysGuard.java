package cz.novanadeje.app.operations.infrastructure.settings;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.Profiles;

import java.util.Arrays;
import java.util.List;

public class DevelopmentKeysGuard implements EnvironmentPostProcessor, Ordered {

    static final String PRODUCTION_PROFILE = "prod";
    private static final String SETTINGS_KEY = "SETTINGS_KEY (" + PublicDevelopmentKeys.SETTINGS_KEY_PROPERTY + ")";
    private static final String BACKUP_KEY = "BACKUP_KEY (" + PublicDevelopmentKeys.BACKUP_KEY_PROPERTY + ")";
    private static final String PUBLIC_VALUE = " holds the public value of the development profile (application-dev.yml), which outside development "
            + "the backend refuses; give the server a key of its own (deploy/README.md, section Hesla a nastavení serveru)";

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE - 1;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        boolean development = environment.acceptsProfiles(Profiles.of(PublicDevelopmentKeys.DEVELOPMENT_PROFILE));
        List<String> active = Arrays.asList(environment.getActiveProfiles());
        if (development ? environment.acceptsProfiles(Profiles.of(PRODUCTION_PROFILE)) : !active.equals(List.of(PRODUCTION_PROFILE))) {
            throw new IllegalStateException("The backend runs either in development or with exactly the prod profile (SPRING_PROFILES_ACTIVE=prod), "
                    + "but the active profiles are " + active);
        }
        if (development) {
            return;
        }
        PublicDevelopmentKeys publicKeys = PublicDevelopmentKeys.ofDevelopmentProfile();
        if (publicKeys.isSettingsKey(environment.getProperty(PublicDevelopmentKeys.SETTINGS_KEY_PROPERTY))) {
            throw new IllegalStateException(SETTINGS_KEY + PUBLIC_VALUE);
        }
        if (publicKeys.isBackupKey(environment.getProperty(PublicDevelopmentKeys.BACKUP_KEY_PROPERTY))) {
            throw new IllegalStateException(BACKUP_KEY + PUBLIC_VALUE);
        }
    }
}
