package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.backup.BackupKey;

record BackupKeyResponse(String key) {

    static BackupKeyResponse of(BackupKey key) {
        return new BackupKeyResponse(key.value());
    }

    @Override
    public String toString() {
        return "BackupKeyResponse[********]";
    }
}
