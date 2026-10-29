package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.backup.RevealedBackupKey;

import java.util.List;

record BackupKeyResponse(String key, List<Integer> checkPositions) {

    static BackupKeyResponse of(RevealedBackupKey revealed) {
        return new BackupKeyResponse(revealed.key().value(), revealed.checkPositions().positions());
    }

    @Override
    public String toString() {
        return "BackupKeyResponse[********]";
    }
}
