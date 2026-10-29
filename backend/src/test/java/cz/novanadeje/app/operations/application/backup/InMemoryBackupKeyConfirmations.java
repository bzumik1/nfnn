package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation;
import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmationRepository;

import java.util.Optional;

public class InMemoryBackupKeyConfirmations implements BackupKeyConfirmationRepository {

    private Optional<BackupKeyConfirmation> confirmation = Optional.empty();

    @Override
    public Optional<BackupKeyConfirmation> find() {
        return confirmation;
    }

    @Override
    public void save(BackupKeyConfirmation confirmation) {
        this.confirmation = Optional.of(confirmation);
    }
}
