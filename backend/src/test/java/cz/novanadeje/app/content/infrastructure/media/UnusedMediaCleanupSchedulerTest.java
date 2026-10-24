package cz.novanadeje.app.content.infrastructure.media;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.content.application.media.MediaCleanup;
import cz.novanadeje.app.content.application.media.UnusedMediaCleanupService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UnusedMediaCleanupSchedulerTest {

    private static final Instant CUTOFF = Instant.parse("2026-10-18T01:30:00Z");

    private final UnusedMediaCleanupService service = mock(UnusedMediaCleanupService.class);
    private final UnusedMediaCleanupScheduler scheduler = new UnusedMediaCleanupScheduler(service);
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
    @DisplayName("Given unused photos, when the daily job runs, then they are deleted and one INFO line gives only their count and the cutoff")
    void should_log_count_and_cutoff_when_run_given_unused_photos() {
        when(service.deleteUnusedMedia()).thenReturn(new MediaCleanup(CUTOFF, 3));

        scheduler.deleteUnusedMedia();

        verify(service).deleteUnusedMedia();
        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.INFO);
            assertThat(event.getFormattedMessage()).isEqualTo("Deleted 3 unused photos uploaded before 2026-10-18T01:30:00Z");
        });
    }

    @Test
    @DisplayName("Given no unused photo, when the daily job runs, then nothing is logged at INFO")
    void should_log_nothing_at_info_when_run_given_no_unused_photo() {
        when(service.deleteUnusedMedia()).thenReturn(new MediaCleanup(CUTOFF, 0));

        scheduler.deleteUnusedMedia();

        assertThat(log.list).noneSatisfy(event -> assertThat(event.getLevel().isGreaterOrEqual(Level.INFO)).isTrue());
    }

    @Test
    @DisplayName("Given a failing database, when the daily job runs, then it logs an error with the exception class only and does not throw")
    void should_log_error_without_throwing_when_run_given_failure() {
        when(service.deleteUnusedMedia()).thenThrow(new IllegalStateException("connection to jana@example.cz lost"));

        assertThatCode(scheduler::deleteUnusedMedia).doesNotThrowAnyException();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.ERROR);
            assertThat(event.getFormattedMessage())
                    .isEqualTo("Deleting unused photos failed: IllegalStateException; retrying at the next run");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(UnusedMediaCleanupScheduler.class);
    }
}
