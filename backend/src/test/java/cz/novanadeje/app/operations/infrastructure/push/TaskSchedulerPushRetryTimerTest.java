package cz.novanadeje.app.operations.infrastructure.push;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.push.PushPace;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.TaskScheduler;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class TaskSchedulerPushRetryTimerTest {

    private static final Instant DUE = Instant.parse("2026-11-12T10:05:00Z");

    private final TaskScheduler scheduler = mock(TaskScheduler.class);
    private final List<Runnable> handedOff = new ArrayList<>();
    private final List<String> ran = new ArrayList<>();
    private final ListAppender<ILoggingEvent> log = new ListAppender<>();

    @BeforeEach
    void captureLog() {
        log.start();
        logger().addAppender(log);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(log);
    }

    @Test
    @DisplayName("Given a retry of a message sent at once, when it is timed, then the scheduler runs the retry itself at its moment, on the scheduler thread")
    void should_run_on_the_scheduler_when_timed_given_a_retry_at_once() {
        new TaskSchedulerPushRetryTimer(scheduler, handedOff::add).at(DUE, PushPace.AT_ONCE, () -> ran.add("retry"));

        scheduled().run();

        assertThat(ran).containsExactly("retry");
        assertThat(handedOff).isEmpty();
    }

    @Test
    @DisplayName("Given a retry of a paced round, when it is due, then the scheduler only hands the round to the application executor, which runs it")
    void should_hand_the_round_to_the_executor_when_due_given_a_paced_retry() {
        new TaskSchedulerPushRetryTimer(scheduler, handedOff::add).at(DUE, PushPace.PACED, () -> ran.add("round"));

        scheduled().run();
        assertThat(ran).isEmpty();
        handedOff.getFirst().run();

        assertThat(ran).containsExactly("round");
    }

    @Test
    @DisplayName("Given a paced retry that comes while the server stops and its executor refuses work, when the retry is due, then one warning names the refusal by its class and nothing else happens")
    void should_warn_when_due_given_executor_refuses_the_round() {
        Executor stopped = task -> {
            throw new IllegalStateException("The executor has stopped");
        };
        new TaskSchedulerPushRetryTimer(scheduler, stopped).at(DUE, PushPace.PACED, () -> ran.add("round"));

        scheduled().run();

        assertThat(ran).isEmpty();
        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel().toString()).isEqualTo("WARN");
            assertThat(event.getFormattedMessage()).isEqualTo("Push retry round could not start: IllegalStateException");
        });
    }

    private Runnable scheduled() {
        ArgumentCaptor<Runnable> task = ArgumentCaptor.forClass(Runnable.class);
        verify(scheduler).schedule(task.capture(), eq(DUE));
        return task.getValue();
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(TaskSchedulerPushRetryTimer.class);
    }
}
