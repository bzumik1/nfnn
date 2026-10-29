package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record AdminActionView(UUID id, UUID adminId, Optional<Donor> admin, String action, Optional<UUID> subjectId, String details,
                              Instant performedAt, Optional<String> client, Optional<AdminActionFacts> facts, Optional<Donor> donor) {

    public Optional<UUID> donorId() {
        return facts.flatMap(AdminActionFacts::donor);
    }
}
