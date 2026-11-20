package cz.novanadeje.app.operations.application.release;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.Revision;
import cz.novanadeje.app.operations.domain.release.RunningBuild;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class ReleaseHistoryConcurrencyTest {

    private static final RunningBuild BUILD = new RunningBuild(Revision.parse("2b79cb3").orElseThrow(), Release.parse("2026.11.109"));

    @Autowired
    private ReleaseHistoryService history;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void startFromEmptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given a first start of a build that holds the history's lock until it commits, when a second start of the same build comes at once, then the second waits, finds the run and begins none, so the build has one run")
    void should_record_one_run_when_two_starts_race_given_the_first_holding_the_lock() throws Exception {
        CountDownLatch recorded = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        TransactionTemplate separately = new TransactionTemplate(transactionManager);

        ExecutorService threads = Executors.newFixedThreadPool(2);
        try {
            Future<ReleaseStart> first = threads.submit(() -> separately.execute(status -> {
                ReleaseStart start = history.recordStart(BUILD);
                recorded.countDown();
                awaitRelease(commit);
                return start;
            }));
            assertThat(recorded.await(30, TimeUnit.SECONDS)).isTrue();
            Future<ReleaseStart> second = threads.submit(() -> separately.execute(status -> history.recordStart(BUILD)));
            await().atMost(Duration.ofSeconds(30)).until(() -> sessionsWaitingForAdvisoryLock() > 0);
            assertThat(second).isNotDone();
            commit.countDown();

            assertThat(first.get(30, TimeUnit.SECONDS)).isEqualTo(ReleaseStart.NEW_RUN);
            assertThat(second.get(30, TimeUnit.SECONDS)).isEqualTo(ReleaseStart.ANOTHER_START);
        } finally {
            commit.countDown();
            threads.shutdownNow();
        }
        assertThat(jdbc.sql("select count(*) from operations_release_run").query(Long.class).single()).isEqualTo(1L);
    }

    private long sessionsWaitingForAdvisoryLock() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' "
                        + "and wait_event = 'advisory'")
                .query(Long.class).single();
    }

    private static void awaitRelease(CountDownLatch latch) {
        try {
            if (!latch.await(60, TimeUnit.SECONDS)) {
                throw new IllegalStateException("The first start was never released");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
