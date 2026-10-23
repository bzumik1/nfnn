package cz.novanadeje.app.shared.application.audit;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record AdminActionEntry(UUID id, UUID adminId, String action, Optional<UUID> subjectId, String details, Instant performedAt,
                               Optional<String> client) {
}
