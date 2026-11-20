package cz.novanadeje.app.operations.domain.release;

import cz.novanadeje.app.shared.domain.FoundationZone;

import java.time.Instant;
import java.time.Period;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class ReleaseHistory {

    public static final Period KEPT_FOR = Period.ofYears(1);
    public static final int MAX_SHOWN = 500;

    private ReleaseHistory() {
    }

    public static Instant keptSince(Instant now) {
        return now.atZone(FoundationZone.ZONE).minus(KEPT_FOR).toInstant();
    }

    public static List<ReleaseRunPeriod> periodsOf(List<ReleaseRun> newestFirst) {
        List<ReleaseRunPeriod> periods = new ArrayList<>(newestFirst.size());
        Optional<Instant> nextStart = Optional.empty();
        for (ReleaseRun run : newestFirst) {
            periods.add(new ReleaseRunPeriod(run, nextStart));
            nextStart = Optional.of(run.startedAt());
        }
        return List.copyOf(periods);
    }
}
