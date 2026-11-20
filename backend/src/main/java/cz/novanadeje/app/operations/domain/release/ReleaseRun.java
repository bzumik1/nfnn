package cz.novanadeje.app.operations.domain.release;

import java.time.Instant;
import java.util.Optional;

public record ReleaseRun(ReleaseRunId id, Revision revision, Optional<Release> release, Instant startedAt, Instant lastStartedAt) {

    public ReleaseRun {
        if (id == null || revision == null || release == null || startedAt == null || lastStartedAt == null) {
            throw new IllegalArgumentException("A release run names its id, revision, release (empty without a number) and both starts");
        }
        if (lastStartedAt.isBefore(startedAt)) {
            throw new IllegalArgumentException("A release run's last start is never before its first");
        }
    }

    public static ReleaseRun beganAt(RunningBuild build, Instant at) {
        return new ReleaseRun(ReleaseRunId.generate(at), build.revision(), build.release(), at, at);
    }

    public boolean isOf(RunningBuild build) {
        return revision.equals(build.revision()) && release.equals(build.release());
    }

    public ReleaseRun startedAgainAt(Instant at) {
        Instant last = at.isAfter(lastStartedAt) ? at : lastStartedAt;
        return new ReleaseRun(id, revision, release, startedAt, last);
    }
}
