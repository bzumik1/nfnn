package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.shared.application.audit.AdminActionEntry;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

record AdminActionEntryRow(UUID id, UUID adminId, String action, UUID subjectId, String details, Instant performedAt, String client) {

    AdminActionEntry toEntry() {
        return new AdminActionEntry(id, adminId, action, Optional.ofNullable(subjectId), details, performedAt, Optional.ofNullable(client));
    }
}
