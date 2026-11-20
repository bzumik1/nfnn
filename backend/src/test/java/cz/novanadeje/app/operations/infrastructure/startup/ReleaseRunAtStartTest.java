package cz.novanadeje.app.operations.infrastructure.startup;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.release.ReleaseHistoryService;
import cz.novanadeje.app.operations.application.release.ReleaseStart;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.Revision;
import cz.novanadeje.app.operations.domain.release.RunningBuild;
import cz.novanadeje.app.shared.infrastructure.config.BuildProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReleaseRunAtStartTest {

    private final ReleaseHistoryService history = mock(ReleaseHistoryService.class);
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
    @DisplayName("Given an image of a release, when the backend is ready, then its revision and release are recorded and a new run is logged without either")
    void should_record_revision_and_release_when_ready_given_an_image_of_a_release() {
        RunningBuild build = new RunningBuild(Revision.parse("2b79cb3").orElseThrow(), Release.parse("2026.11.109"));
        when(history.recordStart(build)).thenReturn(ReleaseStart.NEW_RUN);

        listener("2b79cb3", "2026.11.109").recordStart();

        verify(history).recordStart(build);
        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.INFO);
            assertThat(event.getFormattedMessage()).isEqualTo("Release history: NEW_RUN");
        });
    }

    @Test
    @DisplayName("Given an image without a release number, when the backend is ready, then its revision is recorded without a release")
    void should_record_no_release_when_ready_given_an_image_without_a_release_number() {
        when(history.recordStart(any())).thenReturn(ReleaseStart.ANOTHER_START);

        listener("dev", "dev").recordStart();

        verify(history).recordStart(new RunningBuild(Revision.parse("dev").orElseThrow(), Optional.empty()));
    }

    @Test
    @DisplayName("Given a revision of a shape the history does not keep, when the backend is ready, then nothing is recorded and a warning names no value")
    void should_record_nothing_when_ready_given_an_unrecordable_revision() {
        listener("not a commit", "dev").recordStart();

        verifyNoInteractions(history);
        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).isEqualTo("Release history: the revision has no recordable shape, so this start is not recorded");
        });
    }

    @Test
    @DisplayName("Given a failing database, when the backend is ready, then the start goes on and a warning names only the exception class")
    void should_keep_starting_when_ready_given_a_failing_database() {
        when(history.recordStart(any())).thenThrow(new IllegalStateException("lock timeout for jana@example.cz"));

        assertThatCode(() -> listener("2b79cb3", "2026.11.109").recordStart()).doesNotThrowAnyException();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).isEqualTo("Release history: recording this start failed: IllegalStateException");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    private ReleaseRunAtStart listener(String revision, String version) {
        return new ReleaseRunAtStart(history, new BuildProperties(revision, version));
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ReleaseRunAtStart.class);
    }
}
