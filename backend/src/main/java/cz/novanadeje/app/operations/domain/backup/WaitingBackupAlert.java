package cz.novanadeje.app.operations.domain.backup;

public record WaitingBackupAlert(BackupAlertId id, BackupAlert alert) {

    public WaitingBackupAlert {
        if (id == null || alert == null) {
            throw new IllegalArgumentException("A waiting backup alert has an id and an alert");
        }
    }
}
