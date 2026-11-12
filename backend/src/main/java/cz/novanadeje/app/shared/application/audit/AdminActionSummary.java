package cz.novanadeje.app.shared.application.audit;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record AdminActionSummary(UUID id, UUID adminId, String action, Optional<UUID> subjectId, Instant performedAt, Optional<String> client) {
}
