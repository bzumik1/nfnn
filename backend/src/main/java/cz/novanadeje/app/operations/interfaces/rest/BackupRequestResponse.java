package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.backup.BackupRequest;
import cz.novanadeje.app.operations.domain.backup.BackupRequestKind;

import java.time.Instant;

record BackupRequestResponse(String requestId, BackupRequestKind kind, Instant requestedAt) {

    static BackupRequestResponse from(BackupRequest request) {
        return new BackupRequestResponse(request.id(), request.kind(), request.requestedAt());
    }
}
