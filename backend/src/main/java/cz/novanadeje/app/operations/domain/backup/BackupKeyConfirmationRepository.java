package cz.novanadeje.app.operations.domain.backup;

import java.util.Optional;

public interface BackupKeyConfirmationRepository {

    Optional<BackupKeyConfirmation> find();

    void save(BackupKeyConfirmation confirmation);
}
