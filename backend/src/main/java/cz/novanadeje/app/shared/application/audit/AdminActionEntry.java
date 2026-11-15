package cz.novanadeje.app.shared.application.audit;

import cz.novanadeje.app.shared.application.event.AdminActionPerformed;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record AdminActionEntry(UUID id, UUID adminId, String action, Optional<UUID> subjectId, String details, Optional<AdminActionPerformed.Facts> facts,
                               Instant performedAt, Optional<String> client) {
}
