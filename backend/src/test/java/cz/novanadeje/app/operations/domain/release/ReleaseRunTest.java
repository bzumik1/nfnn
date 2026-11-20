package cz.novanadeje.app.operations.domain.release;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReleaseRunTest {

    private static final Instant FIRST_START = Instant.parse("2026-11-19T18:02:11Z");
    private static final Revision REVISION = Revision.parse("2b79cb3").orElseThrow();
    private static final Optional<Release> RELEASE = Release.parse("2026.11.109");
    private static final RunningBuild BUILD = new RunningBuild(REVISION, RELEASE);

    @Test
    @DisplayName("Given a first start of a revision, when the run begins, then it started and last started at that moment")
    void should_start_and_last_start_at_the_moment_when_begun_given_a_first_start() {
        ReleaseRun run = ReleaseRun.beganAt(BUILD, FIRST_START);

        assertThat(run.revision()).isEqualTo(REVISION);
        assertThat(run.release()).isEqualTo(RELEASE);
        assertThat(run.startedAt()).isEqualTo(FIRST_START);
        assertThat(run.lastStartedAt()).isEqualTo(FIRST_START);
    }

    @Test
    @DisplayName("Given a run, when the same revision and release start again, then the run continues and only its last start moves")
    void should_move_only_the_last_start_when_started_again_given_the_same_revision_and_release() {
        ReleaseRun run = ReleaseRun.beganAt(BUILD, FIRST_START);
        Instant restart = FIRST_START.plusSeconds(3600);

        assertThat(run.isOf(BUILD)).isTrue();
        ReleaseRun restarted = run.startedAgainAt(restart);

        assertThat(restarted.id()).isEqualTo(run.id());
        assertThat(restarted.startedAt()).isEqualTo(FIRST_START);
        assertThat(restarted.lastStartedAt()).isEqualTo(restart);
    }

    @Test
    @DisplayName("Given a run, when another revision or the same revision with another release starts, then that is no start of this run")
    void should_not_continue_when_asked_given_another_revision_or_release() {
        ReleaseRun run = ReleaseRun.beganAt(BUILD, FIRST_START);

        assertThat(run.isOf(new RunningBuild(Revision.parse("d953749").orElseThrow(), RELEASE))).isFalse();
        assertThat(run.isOf(new RunningBuild(REVISION, Release.parse("2026.11.110")))).isFalse();
        assertThat(run.isOf(new RunningBuild(REVISION, Optional.empty()))).isFalse();
    }

    @Test
    @DisplayName("Given a clock that went back, when the run starts again, then its last start never goes before a start it already had")
    void should_keep_the_last_start_when_started_again_given_an_earlier_moment() {
        ReleaseRun run = ReleaseRun.beganAt(BUILD, FIRST_START).startedAgainAt(FIRST_START.plusSeconds(60));

        ReleaseRun restarted = run.startedAgainAt(FIRST_START.minusSeconds(60));

        assertThat(restarted.lastStartedAt()).isEqualTo(FIRST_START.plusSeconds(60));
    }

    @Test
    @DisplayName("Given a last start before the first, when a run is built, then it is refused")
    void should_refuse_when_built_given_a_last_start_before_the_first() {
        assertThatThrownBy(() -> new ReleaseRun(ReleaseRunId.generate(FIRST_START), REVISION, RELEASE, FIRST_START, FIRST_START.minusSeconds(1)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
