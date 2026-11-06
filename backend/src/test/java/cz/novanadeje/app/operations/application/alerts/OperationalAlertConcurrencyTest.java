package cz.novanadeje.app.operations.application.alerts;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class OperationalAlertConcurrencyTest {

    private static final Instant FIRST = Instant.parse("2026-11-05T10:00:00Z");
    private static final Instant SECOND = FIRST.plusSeconds(1);

    @Autowired
    private OperationalAlertService alerts;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void startFromEmptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given a refused e-mail whose opening holds the alert lock until it commits, when a second refused e-mail is recorded at the same time, then the second waits, finds the alert open and changes nothing, so the outage is counted and pushed once")
    void should_open_the_alert_once_when_two_failures_race_given_the_first_holding_the_lock() throws Exception {
        CountDownLatch recorded = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        TransactionTemplate separately = new TransactionTemplate(transactionManager);

        ExecutorService threads = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = threads.submit(() -> separately.executeWithoutResult(status -> {
                alerts.record(MonitoredArea.MAIL, true, FIRST);
                recorded.countDown();
                awaitRelease(commit);
            }));
            assertThat(recorded.await(30, TimeUnit.SECONDS)).isTrue();
            Future<?> second = threads.submit(() -> separately.executeWithoutResult(status -> alerts.record(MonitoredArea.MAIL, true, SECOND)));
            await().atMost(Duration.ofSeconds(30)).until(() -> sessionsWaitingForAdvisoryLock() > 0);
            assertThat(second).isNotDone();
            commit.countDown();

            first.get(30, TimeUnit.SECONDS);
            second.get(30, TimeUnit.SECONDS);
        } finally {
            commit.countDown();
            threads.shutdownNow();
        }
        assertThat(mailAlert()).containsEntry("changes", 1L).containsEntry("open_since", OffsetDateTime.ofInstant(FIRST, ZoneOffset.UTC));
    }

    private Map<String, Object> mailAlert() {
        return jdbc.sql("select changes, open_since from operations_alert where area = 'MAIL'")
                .query((row, number) -> Map.<String, Object>of("changes", row.getLong("changes"),
                        "open_since", row.getObject("open_since", OffsetDateTime.class).withOffsetSameInstant(ZoneOffset.UTC)))
                .single();
    }

    private long sessionsWaitingForAdvisoryLock() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' "
                        + "and wait_event = 'advisory'")
                .query(Long.class).single();
    }

    private static void awaitRelease(CountDownLatch latch) {
        try {
            if (!latch.await(60, TimeUnit.SECONDS)) {
                throw new IllegalStateException("The first opening was never released");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
