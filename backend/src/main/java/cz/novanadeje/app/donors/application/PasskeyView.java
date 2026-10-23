package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Passkey;

import java.time.Instant;
import java.util.UUID;

public record PasskeyView(UUID id, String name, Instant createdAt, Instant lastUsedAt) {

    static PasskeyView of(Passkey passkey) {
        return new PasskeyView(passkey.id().value(), passkey.name(), passkey.createdAt(), passkey.lastUsedAt().orElse(null));
    }
}
