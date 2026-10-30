package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

final class ListedTrail implements AdminActionTrail {

    final List<AdminActionEntry> entries = new ArrayList<>();
    final List<Set<String>> asked = new ArrayList<>();

    @Override
    public List<AdminActionEntry> findPerformedBefore(Instant before, int limit) {
        throw new UnsupportedOperationException("the key history asks by action");
    }

    @Override
    public long countPerformedSince(UUID adminId, String action, Instant since) {
        throw new UnsupportedOperationException("the key history asks by action");
    }

    @Override
    public List<AdminActionEntry> findByActions(Set<String> actions) {
        asked.add(Set.copyOf(actions));
        return entries.stream().filter(entry -> actions.contains(entry.action())).toList();
    }
}
