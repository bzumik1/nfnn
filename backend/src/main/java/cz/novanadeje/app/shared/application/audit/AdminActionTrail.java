package cz.novanadeje.app.shared.application.audit;

import java.time.Instant;
import java.util.List;

public interface AdminActionTrail {

    List<AdminActionEntry> findPerformedBefore(Instant before, int limit);
}
