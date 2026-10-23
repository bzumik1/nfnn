package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.PasskeyView;

import java.time.Instant;
import java.util.UUID;

record PasskeyResponse(UUID id, String name, Instant createdAt, Instant lastUsedAt) {

    static PasskeyResponse of(PasskeyView view) {
        return new PasskeyResponse(view.id(), view.name(), view.createdAt(), view.lastUsedAt());
    }
}
