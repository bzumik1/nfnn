package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.backup.RestoreRequest;

import java.time.Instant;

record RestoreRequestResponse(String requestId, String fileName, Instant requestedAt) {

    static RestoreRequestResponse from(RestoreRequest request) {
        return new RestoreRequestResponse(request.id(), request.fileName(), request.requestedAt());
    }
}
