package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.shared.application.audit.AdminActionSummary;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

record AdminActionSummaryRow(UUID id, UUID adminId, String action, UUID subjectId, Instant performedAt, String client) {

    AdminActionSummary toSummary() {
        return new AdminActionSummary(id, adminId, action, Optional.ofNullable(subjectId), performedAt, Optional.ofNullable(client));
    }
}
