package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.PublicBackupKeyPolicy;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.infrastructure.settings.PublicDevelopmentKeys;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component
public class DevelopmentBackupKeyPolicy implements PublicBackupKeyPolicy {

    private final boolean development;
    private final PublicDevelopmentKeys publicKeys;

    public DevelopmentBackupKeyPolicy(Environment environment) {
        this.development = environment.acceptsProfiles(Profiles.of(PublicDevelopmentKeys.DEVELOPMENT_PROFILE));
        this.publicKeys = PublicDevelopmentKeys.ofDevelopmentProfile();
    }

    @Override
    public boolean refuses(BackupKey key) {
        return !development && publicKeys.isBackupKey(key.value());
    }
}
