package cz.novanadeje.app.operations.application.release;

import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseRun;
import cz.novanadeje.app.operations.domain.release.ReleaseRunPeriod;
import cz.novanadeje.app.operations.domain.release.ReleaseRunRepository;
import cz.novanadeje.app.operations.domain.release.Revision;
import cz.novanadeje.app.operations.domain.release.RunningBuild;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class ReleaseHistoryServiceTest {

    private static final Instant DEPLOYED = Instant.parse("2026-11-12T16:30:00Z");
    private static final RunningBuild OLDER = build("d953749", "2026.11.98");
    private static final RunningBuild NEWER = build("2b79cb3", "2026.11.109");

    private final MutableClock clock = new MutableClock(DEPLOYED, ZoneOffset.UTC);
    private final InMemoryReleaseRuns runs = new InMemoryReleaseRuns();
    private final ReleaseHistoryService service = new ReleaseHistoryService(runs, clock);

    @Test
    @DisplayName("Given no run recorded, when the backend starts, then a run of its build begins under the lock")
    void should_begin_a_run_under_the_lock_when_started_given_no_run() {
        assertThat(service.recordStart(NEWER)).isEqualTo(ReleaseStart.NEW_RUN);

        assertThat(runs.lockedBeforeEachWrite).isTrue();
        assertThat(service.history()).singleElement().satisfies(period -> {
            assertThat(period.run().isOf(NEWER)).isTrue();
            assertThat(period.run().startedAt()).isEqualTo(DEPLOYED);
            assertThat(period.endedAt()).isEmpty();
        });
    }

    @Test
    @DisplayName("Given the running build recorded, when the backend starts again, then no run begins and only the last start moves")
    void should_move_only_the_last_start_when_restarted_given_the_same_build() {
        service.recordStart(NEWER);
        clock.advance(Duration.ofHours(3));

        assertThat(service.recordStart(NEWER)).isEqualTo(ReleaseStart.ANOTHER_START);

        assertThat(service.history()).singleElement().satisfies(period -> {
            assertThat(period.run().startedAt()).isEqualTo(DEPLOYED);
            assertThat(period.run().lastStartedAt()).isEqualTo(DEPLOYED.plus(Duration.ofHours(3)));
        });
    }

    @Test
    @DisplayName("Given a deploy and a rollback, when the history is read, then each start of another build began its own run, newest first")
    void should_begin_a_run_for_each_change_when_read_given_a_deploy_and_a_rollback() {
        service.recordStart(OLDER);
        clock.advance(Duration.ofDays(7));
        service.recordStart(NEWER);
        clock.advance(Duration.ofHours(1));

        assertThat(service.recordStart(OLDER)).isEqualTo(ReleaseStart.NEW_RUN);

        List<ReleaseRunPeriod> history = service.history();
        assertThat(history).extracting(period -> period.run().isOf(OLDER)).containsExactly(true, false, true);
        assertThat(history.get(1).endedAt()).contains(DEPLOYED.plus(Duration.ofDays(7)).plus(Duration.ofHours(1)));
        assertThat(history.get(2).endedAt()).contains(DEPLOYED.plus(Duration.ofDays(7)));
    }

    @Test
    @DisplayName("Given runs that ended before and after the year's edge, when the clean-up runs, then it deletes under the lock only what ended before the edge")
    void should_delete_what_ended_before_the_edge_when_cleaned_given_runs_around_it() {
        service.recordStart(OLDER);
        clock.advance(Duration.ofDays(5));
        service.recordStart(NEWER);
        clock.advance(Duration.ofDays(25));
        service.recordStart(OLDER);
        clock.set(Instant.parse("2027-11-20T02:40:00Z"));

        ReleaseHistoryPurge purge = service.deleteEndedRuns();

        assertThat(purge).isEqualTo(new ReleaseHistoryPurge(Instant.parse("2026-11-20T02:40:00Z"), 1));
        assertThat(runs.lockedBeforeEachWrite).isTrue();
        assertThat(runs.cutoffs).containsExactly(Instant.parse("2026-11-20T02:40:00Z"));
        assertThat(service.history()).extracting(period -> period.run().startedAt())
                .containsExactly(DEPLOYED.plus(Duration.ofDays(30)), DEPLOYED.plus(Duration.ofDays(5)));
    }

    private static RunningBuild build(String revision, String release) {
        return new RunningBuild(Revision.parse(revision).orElseThrow(), Release.parse(release));
    }

    private static final class InMemoryReleaseRuns implements ReleaseRunRepository {

        private static final Comparator<ReleaseRun> NEWEST_FIRST = Comparator.comparing(ReleaseRun::startedAt)
                .thenComparing(run -> run.id().value()).reversed();

        private final List<ReleaseRun> stored = new ArrayList<>();
        private final List<Instant> cutoffs = new ArrayList<>();
        private boolean locked;
        private boolean lockedBeforeEachWrite = true;

        @Override
        public void lockWrites() {
            locked = true;
        }

        @Override
        public Optional<ReleaseRun> findNewest() {
            return stored.stream().min(NEWEST_FIRST);
        }

        @Override
        public List<ReleaseRun> findNewestFirst(int limit) {
            return stored.stream().sorted(NEWEST_FIRST).limit(limit).toList();
        }

        @Override
        public void save(ReleaseRun run) {
            written();
            stored.removeIf(existing -> existing.id().equals(run.id()));
            stored.add(run);
        }

        @Override
        public int deleteEndedBefore(Instant cutoff) {
            written();
            cutoffs.add(cutoff);
            List<ReleaseRun> newestFirst = findNewestFirst(Integer.MAX_VALUE);
            List<ReleaseRun> ended = new ArrayList<>();
            for (int index = 1; index < newestFirst.size(); index++) {
                if (newestFirst.get(index - 1).startedAt().isBefore(cutoff)) {
                    ended.add(newestFirst.get(index));
                }
            }
            stored.removeAll(ended);
            return ended.size();
        }

        private void written() {
            lockedBeforeEachWrite &= locked;
            locked = false;
        }
    }
}
