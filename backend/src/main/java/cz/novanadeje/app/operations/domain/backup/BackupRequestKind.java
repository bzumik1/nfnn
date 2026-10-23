package cz.novanadeje.app.operations.domain.backup;

public enum BackupRequestKind {
    BACKUP("backup"), TEST_RESTORE("test-restore");

    private final String fileExtension;

    BackupRequestKind(String fileExtension) {
        this.fileExtension = fileExtension;
    }

    public String fileExtension() {
        return fileExtension;
    }
}
