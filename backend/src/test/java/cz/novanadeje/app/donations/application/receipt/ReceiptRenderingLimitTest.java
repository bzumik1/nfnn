package cz.novanadeje.app.donations.application.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReceiptRenderingLimitTest {

    @Test
    @DisplayName("Given a limit of two, when six receipts are produced at once, then never more than two run together and all finish")
    void should_run_at_most_limit_together_when_many_wait_given_limit_of_two() throws Exception {
        ReceiptRenderingLimit limit = new ReceiptRenderingLimit(2);
        AtomicInteger running = new AtomicInteger();
        AtomicInteger mostAtOnce = new AtomicInteger();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(6);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int caller = 0; caller < 6; caller++) {
                int number = caller;
                results.add(callers.submit(() -> {
                    start.await();
                    return limit.withinLimit(() -> {
                        mostAtOnce.accumulateAndGet(running.incrementAndGet(), Math::max);
                        sleep();
                        running.decrementAndGet();
                        return number;
                    });
                }));
            }
            start.countDown();

            for (int caller = 0; caller < 6; caller++) {
                assertThat(results.get(caller).get(10, TimeUnit.SECONDS)).isEqualTo(caller);
            }
        } finally {
            callers.shutdownNow();
        }
        assertThat(mostAtOnce.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given work that fails, when it runs within the limit, then the failure propagates and the slot is free again")
    void should_free_slot_when_work_fails_given_limit_of_one() {
        ReceiptRenderingLimit limit = new ReceiptRenderingLimit(1);

        assertThatThrownBy(() -> limit.withinLimit(() -> {
            throw new IllegalStateException("render failed");
        })).hasMessage("render failed");
        assertThat(limit.withinLimit(() -> "next")).isEqualTo("next");
    }

    @Test
    @DisplayName("Given fewer than one slot, when a limit is made, then it is refused")
    void should_refuse_when_made_given_no_slot() {
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptRenderingLimit(0));
    }

    private static void sleep() {
        try {
            Thread.sleep(50);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }
}
