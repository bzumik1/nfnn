package cz.novanadeje.app.operations.domain.backup;

public interface BackupAlertStateRepository {

    BackupAlertState current();

    void save(BackupAlertState state);
}
