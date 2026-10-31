package cz.novanadeje.app.shared.application.audit;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public interface AdminActionTrail {

    List<AdminActionEntry> findPerformedBefore(Instant before, int limit);

    long countPerformedSince(UUID adminId, String action, Instant since);

    List<AdminActionEntry> findByActions(Set<String> actions);
}
