package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.backup.PublicBackupKeyPolicy;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.infrastructure.backup.DevelopmentBackupKeyPolicy;
import org.springframework.mock.env.MockEnvironment;

public class SwitchablePublicBackupKeyPolicy implements PublicBackupKeyPolicy {

    private final PublicBackupKeyPolicy development;
    private final PublicBackupKeyPolicy production;
    private volatile PublicBackupKeyPolicy current;

    public SwitchablePublicBackupKeyPolicy() {
        MockEnvironment developmentProfile = new MockEnvironment();
        developmentProfile.setDefaultProfiles("dev");
        MockEnvironment productionProfile = new MockEnvironment();
        productionProfile.setActiveProfiles("prod");
        this.development = new DevelopmentBackupKeyPolicy(developmentProfile);
        this.production = new DevelopmentBackupKeyPolicy(productionProfile);
        this.current = development;
    }

    public void runOutsideDevelopment() {
        current = production;
    }

    public void reset() {
        current = development;
    }

    @Override
    public boolean refuses(BackupKey key) {
        return current.refuses(key);
    }
}
