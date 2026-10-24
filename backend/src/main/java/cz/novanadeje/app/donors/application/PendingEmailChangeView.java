package cz.novanadeje.app.donors.application;

import java.time.Instant;

public record PendingEmailChangeView(String newEmail, Instant expiresAt) {
}
