package cz.novanadeje.app.operations.application.release;

import cz.novanadeje.app.operations.domain.release.ReleaseHistory;
import cz.novanadeje.app.operations.domain.release.ReleaseRun;
import cz.novanadeje.app.operations.domain.release.ReleaseRunPeriod;
import cz.novanadeje.app.operations.domain.release.ReleaseRunRepository;
import cz.novanadeje.app.operations.domain.release.RunningBuild;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class ReleaseHistoryService {

    private final ReleaseRunRepository runs;
    private final Clock clock;

    public ReleaseHistoryService(ReleaseRunRepository runs, Clock clock) {
        this.runs = runs;
        this.clock = clock;
    }

    @Transactional
    public ReleaseStart recordStart(RunningBuild build) {
        runs.lockWrites();
        Instant now = clock.instant();
        Optional<ReleaseRun> running = runs.findNewest().filter(newest -> newest.isOf(build));
        if (running.isPresent()) {
            runs.save(running.get().startedAgainAt(now));
            return ReleaseStart.ANOTHER_START;
        }
        runs.save(ReleaseRun.beganAt(build, now));
        return ReleaseStart.NEW_RUN;
    }

    @Transactional(readOnly = true)
    public List<ReleaseRunPeriod> history() {
        return ReleaseHistory.periodsOf(runs.findNewestFirst(ReleaseHistory.MAX_SHOWN));
    }

    @Transactional
    public ReleaseHistoryPurge deleteEndedRuns() {
        runs.lockWrites();
        Instant edge = ReleaseHistory.keptSince(clock.instant());
        return new ReleaseHistoryPurge(edge, runs.deleteEndedBefore(edge));
    }
}
