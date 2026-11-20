package cz.novanadeje.app.operations.domain.release;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class ReleaseHistoryTest {

    private static final Instant DEPLOYED = Instant.parse("2026-11-12T16:30:00Z");
    private static final Instant NEXT_DEPLOY = Instant.parse("2026-11-19T18:02:11Z");

    @Test
    @DisplayName("Given runs newest first, when the history is read, then each run ended when the next newer one started and the newest runs still")
    void should_end_each_run_at_the_next_newer_start_when_read_given_runs_newest_first() {
        ReleaseRun older = run("d953749", "2026.11.98", DEPLOYED);
        ReleaseRun newest = run("2b79cb3", "2026.11.109", NEXT_DEPLOY);

        List<ReleaseRunPeriod> periods = ReleaseHistory.periodsOf(List.of(newest, older));

        assertThat(periods).containsExactly(new ReleaseRunPeriod(newest, Optional.empty()), new ReleaseRunPeriod(older, Optional.of(NEXT_DEPLOY)));
    }

    @Test
    @DisplayName("Given no run, when the history is read, then it is empty")
    void should_be_empty_when_read_given_no_run() {
        assertThat(ReleaseHistory.periodsOf(List.of())).isEmpty();
    }

    @Test
    @DisplayName("Given a moment in Prague's winter, when the history's edge is asked, then it is the same Prague time a calendar year before")
    void should_keep_a_prague_calendar_year_when_the_edge_is_asked_given_a_winter_moment() {
        assertThat(ReleaseHistory.keptSince(Instant.parse("2026-11-20T02:40:00Z"))).isEqualTo(Instant.parse("2025-11-20T02:40:00Z"));
    }

    @Test
    @DisplayName("Given a moment whose day a year before had the other Prague offset, when the history's edge is asked, then it is the same Prague wall time")
    void should_follow_the_prague_wall_time_when_the_edge_is_asked_given_a_change_of_offset() {
        assertThat(ReleaseHistory.keptSince(Instant.parse("2027-03-28T01:40:00Z"))).isEqualTo(Instant.parse("2026-03-28T02:40:00Z"));
        assertThat(ReleaseHistory.keptSince(Instant.parse("2026-10-25T02:40:00Z"))).isEqualTo(Instant.parse("2025-10-25T01:40:00Z"));
    }

    private static ReleaseRun run(String revision, String release, Instant startedAt) {
        return ReleaseRun.beganAt(new RunningBuild(Revision.parse(revision).orElseThrow(), Release.parse(release)), startedAt);
    }
}
