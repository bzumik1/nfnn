package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.UUID;

public record AdministrationRevoked(UUID donorId, Instant revokedAt) {
}
