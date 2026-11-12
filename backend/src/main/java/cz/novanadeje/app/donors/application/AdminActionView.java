package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public record AdminActionView(UUID id, UUID adminId, Optional<Donor> admin, String action, Optional<UUID> subjectId, String details,
                              Instant performedAt, Optional<String> client, Optional<AdminActionFacts> facts, Optional<Donor> donor) {

    static AdminActionView of(AdminActionEntry entry, Optional<AdminActionFacts> facts, Map<UUID, Donor> donorsById) {
        return new AdminActionView(entry.id(), entry.adminId(), Optional.ofNullable(donorsById.get(entry.adminId())), entry.action(), entry.subjectId(),
                entry.details(), entry.performedAt(), entry.client(), facts, facts.flatMap(AdminActionFacts::donor).map(donorsById::get));
    }

    public Optional<UUID> donorId() {
        return facts.flatMap(AdminActionFacts::donor);
    }
}
