package cz.novanadeje.app.operations.infrastructure.release;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.release.ReleaseHistoryPurge;
import cz.novanadeje.app.operations.application.release.ReleaseHistoryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReleaseHistoryCleanupSchedulerTest {

    private static final Instant EDGE = Instant.parse("2025-11-20T02:40:00Z");

    private final ReleaseHistoryService service = mock(ReleaseHistoryService.class);
    private final ReleaseHistoryCleanupScheduler scheduler = new ReleaseHistoryCleanupScheduler(service);
    private ListAppender<ILoggingEvent> log;

    @BeforeEach
    void captureLog() {
        log = new ListAppender<>();
        log.start();
        logger().addAppender(log);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(log);
    }

    @Test
    @DisplayName("Given runs that ended before the year's edge, when the daily job runs, then one INFO line gives only their count and the edge")
    void should_log_count_and_edge_when_run_given_ended_runs() {
        when(service.deleteEndedRuns()).thenReturn(new ReleaseHistoryPurge(EDGE, 2));

        scheduler.deleteEndedRuns();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.INFO);
            assertThat(event.getFormattedMessage()).isEqualTo("Deleted 2 release history entries that ended before 2025-11-20T02:40:00Z");
        });
    }

    @Test
    @DisplayName("Given no run that ended before the edge, when the daily job runs, then nothing is logged at INFO")
    void should_log_nothing_at_info_when_run_given_nothing_ended() {
        when(service.deleteEndedRuns()).thenReturn(new ReleaseHistoryPurge(EDGE, 0));

        scheduler.deleteEndedRuns();

        assertThat(log.list).noneSatisfy(event -> assertThat(event.getLevel().isGreaterOrEqual(Level.INFO)).isTrue());
    }

    @Test
    @DisplayName("Given a failing database, when the daily job runs, then it logs an error with the exception class only and does not throw")
    void should_log_error_without_throwing_when_run_given_failure() {
        when(service.deleteEndedRuns()).thenThrow(new IllegalStateException("connection lost to jana@example.cz"));

        assertThatCode(scheduler::deleteEndedRuns).doesNotThrowAnyException();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.ERROR);
            assertThat(event.getFormattedMessage()).isEqualTo("Deleting ended release history entries failed: IllegalStateException; retrying at the next run");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ReleaseHistoryCleanupScheduler.class);
    }
}
