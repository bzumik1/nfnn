package cz.novanadeje.app.donations.application.signing;

import java.time.Instant;
import java.util.UUID;

public record UnreadableKeyAuditEntry(UUID entryId, String action, Instant performedAt) {
}
