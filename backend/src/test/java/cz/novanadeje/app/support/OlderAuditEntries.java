package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.application.AdminActionFacts;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class OlderAuditEntries {

    private static final UUID ANY_ID = new UUID(0, 1);

    private OlderAuditEntries() {
    }

    public static Optional<AdminActionFacts> factsOf(String action, String details) {
        return AdminActionFacts.of(new AdminActionEntry(ANY_ID, ANY_ID, action, Optional.empty(), details, Optional.empty(), Instant.EPOCH, Optional.empty()));
    }
}
