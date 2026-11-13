package cz.novanadeje.app.shared.infrastructure.net;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TimeBoundedCallTest {

    @Test
    @DisplayName("Given a call that answers in time, when it is run within a limit, then its answer comes back")
    void should_return_the_answer_when_run_given_a_call_that_answers_in_time() throws Exception {
        String answer = TimeBoundedCall.within(Duration.ofSeconds(1), "answering", () -> "answer");

        assertThat(answer).isEqualTo("answer");
    }

    @Test
    @DisplayName("Given a call that fails, when it is run within a limit, then its failure comes back as the cause")
    void should_return_the_failure_as_cause_when_run_given_a_failing_call() {
        assertThatThrownBy(() -> TimeBoundedCall.within(Duration.ofSeconds(1), "failing", () -> {
            throw new IOException("refused");
        })).isInstanceOf(ExecutionException.class).hasCauseInstanceOf(IOException.class);
    }

    @Test
    @DisplayName("Given a call that never answers, when it is run within a limit, then it ends within the limit and the call is interrupted")
    void should_end_within_limit_and_interrupt_when_run_given_a_call_that_never_answers() throws InterruptedException {
        CountDownLatch never = new CountDownLatch(1);
        CountDownLatch interrupted = new CountDownLatch(1);
        long started = System.nanoTime();

        assertThatThrownBy(() -> TimeBoundedCall.within(Duration.ofMillis(200), "stalled", () -> {
            try {
                never.await();
            } catch (InterruptedException stopped) {
                interrupted.countDown();
                throw stopped;
            }
            return "never";
        })).isInstanceOf(TimeoutException.class);

        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(2));
        assertThat(interrupted.await(2, TimeUnit.SECONDS)).isTrue();
    }
}
