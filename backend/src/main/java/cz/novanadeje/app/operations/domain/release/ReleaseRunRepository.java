package cz.novanadeje.app.operations.domain.release;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ReleaseRunRepository {

    void lockWrites();

    Optional<ReleaseRun> findNewest();

    List<ReleaseRun> findNewestFirst(int limit);

    void save(ReleaseRun run);

    int deleteEndedBefore(Instant cutoff);
}
