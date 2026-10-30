package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.PublicBackupKeyPolicy;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class DevelopmentBackupKeyPolicy implements PublicBackupKeyPolicy {

    public DevelopmentBackupKeyPolicy(Environment environment) {
    }

    @Override
    public boolean refuses(BackupKey key) {
        return false;
    }
}
