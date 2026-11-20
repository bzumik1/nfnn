package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseRun;
import cz.novanadeje.app.operations.domain.release.ReleaseRunId;
import cz.novanadeje.app.operations.domain.release.ReleaseRunRepository;
import cz.novanadeje.app.operations.domain.release.Revision;
import cz.novanadeje.app.operations.domain.release.RunningBuild;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@PersistenceTest
class JpaReleaseRunRepositoryTest {

    private static final Instant DEPLOYED = Instant.parse("2026-11-12T16:30:00Z");
    private static final RunningBuild RELEASED = new RunningBuild(Revision.parse("2b79cb3").orElseThrow(), Release.parse("2026.11.109"));
    private static final RunningBuild DEVELOPMENT = new RunningBuild(Revision.parse("dev").orElseThrow(), Optional.empty());

    @Autowired
    private ReleaseRunRepository runs;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private DataSource dataSource;

    @Test
    @DisplayName("Given nothing recorded, when the newest run is read, then there is none")
    void should_find_no_run_when_read_given_nothing_recorded() {
        assertThat(runs.findNewest()).isEmpty();
        assertThat(runs.findNewestFirst(10)).isEmpty();
    }

    @Test
    @DisplayName("Given a run of a release and one without a release number, when they are read back, then both round-trip, the newest first")
    void should_round_trip_newest_first_when_read_given_two_runs() {
        ReleaseRun older = ReleaseRun.beganAt(RELEASED, DEPLOYED);
        ReleaseRun newer = ReleaseRun.beganAt(DEVELOPMENT, DEPLOYED.plus(Duration.ofDays(1)));
        runs.save(older);
        runs.save(newer);
        flushAndForget();

        assertThat(runs.findNewest()).contains(newer);
        assertThat(runs.findNewestFirst(10)).containsExactly(newer, older);
        assertThat(runs.findNewestFirst(1)).containsExactly(newer);
    }

    @Test
    @DisplayName("Given two runs that started in the same instant, when the newest is read, then the later id wins")
    void should_order_by_id_when_read_given_the_same_start() {
        ReleaseRun first = run(new UUID(0x019a000000007000L, 0x8000000000000001L), RELEASED, DEPLOYED);
        ReleaseRun second = run(new UUID(0x019a000000007000L, 0x8000000000000002L), DEVELOPMENT, DEPLOYED);
        runs.save(second);
        runs.save(first);
        flushAndForget();

        assertThat(runs.findNewest()).contains(second);
    }

    @Test
    @DisplayName("Given a recorded run, when it starts again, then the stored row keeps its first start and moves its last start")
    void should_move_the_last_start_when_saved_again_given_a_recorded_run() {
        ReleaseRun run = ReleaseRun.beganAt(RELEASED, DEPLOYED);
        runs.save(run);
        flushAndForget();

        runs.save(run.startedAgainAt(DEPLOYED.plus(Duration.ofHours(2))));
        flushAndForget();

        assertThat(runs.findNewest()).hasValueSatisfying(stored -> {
            assertThat(stored.startedAt()).isEqualTo(DEPLOYED);
            assertThat(stored.lastStartedAt()).isEqualTo(DEPLOYED.plus(Duration.ofHours(2)));
        });
        assertThat(jdbc.sql("select count(*) from operations_release_run").query(Long.class).single()).isEqualTo(1L);
    }

    @Test
    @DisplayName("Given three runs, when what ended before an edge is deleted, then a run whose successor started before the edge goes and the run of that moment and the newest stay")
    void should_delete_only_runs_that_ended_before_the_edge_when_cleaned_given_three_runs() {
        ReleaseRun oldest = ReleaseRun.beganAt(RELEASED, DEPLOYED);
        ReleaseRun runningAtTheEdge = ReleaseRun.beganAt(DEVELOPMENT, DEPLOYED.plus(Duration.ofDays(10)));
        ReleaseRun newest = ReleaseRun.beganAt(RELEASED, DEPLOYED.plus(Duration.ofDays(40)));
        runs.save(oldest);
        runs.save(runningAtTheEdge);
        runs.save(newest);
        flushAndForget();

        assertThat(runs.deleteEndedBefore(DEPLOYED.plus(Duration.ofDays(10)))).isZero();
        assertThat(runs.deleteEndedBefore(DEPLOYED.plus(Duration.ofDays(20)))).isEqualTo(1);
        flushAndForget();

        assertThat(runs.findNewestFirst(10)).containsExactly(newest, runningAtTheEdge);
    }

    @Test
    @DisplayName("Given only one run that started long ago, when what ended before today is deleted, then the newest run stays")
    void should_keep_the_newest_run_when_cleaned_given_it_started_long_ago() {
        ReleaseRun only = ReleaseRun.beganAt(RELEASED, DEPLOYED);
        runs.save(only);
        flushAndForget();

        assertThat(runs.deleteEndedBefore(DEPLOYED.plus(Duration.ofDays(800)))).isZero();

        assertThat(runs.findNewest()).contains(only);
    }

    @ParameterizedTest
    @CsvSource({"2b79 cb3, 2026.11.109", "2b79cb3, 2026.13.1", "2b79cb3, dev"})
    @DisplayName("Given a revision or release of another shape written past the domain, when it is inserted, then the database refuses it")
    void should_refuse_when_inserted_given_a_shape_the_domain_never_writes(String revision, String release) {
        assertThatThrownBy(() -> insertRaw(revision, release)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("Given the release history's writes locked in one transaction, when another connection tries each lock, then it gets the alerts' lock and not the history's")
    void should_leave_other_locks_free_when_tried_given_the_history_writes_locked() throws Exception {
        runs.lockWrites();

        assertThat(triedFromAnotherConnection(AdvisoryLock.OPERATIONAL_ALERT_CHANGES)).isTrue();
        assertThat(triedFromAnotherConnection(AdvisoryLock.RELEASE_HISTORY)).isFalse();
    }

    private void insertRaw(String revision, String release) {
        jdbc.sql("insert into operations_release_run (id, revision, release, started_at, last_started_at) values (:id, :revision, :release, now(), now())")
                .param("id", ReleaseRunId.generate(DEPLOYED).value())
                .param("revision", revision)
                .param("release", release)
                .update();
    }

    private static ReleaseRun run(UUID id, RunningBuild build, Instant startedAt) {
        return new ReleaseRun(new ReleaseRunId(id), build.revision(), build.release(), startedAt, startedAt);
    }

    private void flushAndForget() {
        entityManager.flush();
        entityManager.clear();
    }

    private boolean triedFromAnotherConnection(AdvisoryLock lock) throws Exception {
        return CompletableFuture.supplyAsync(() -> {
            try (Connection connection = dataSource.getConnection();
                 PreparedStatement statement = connection.prepareStatement("select pg_try_advisory_xact_lock(?)")) {
                connection.setAutoCommit(true);
                statement.setLong(1, lock.key());
                try (ResultSet result = statement.executeQuery()) {
                    result.next();
                    return result.getBoolean(1);
                }
            } catch (SQLException e) {
                throw new IllegalStateException(e);
            }
        }).get(10, TimeUnit.SECONDS);
    }
}
