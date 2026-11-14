package cz.novanadeje.app.shared.infrastructure.busy;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CpuSlotsTest {

    private static final Duration SHORT_WAIT = Duration.ofMillis(50);

    @Test
    @DisplayName("Given a free slot, when work runs, then its result comes back")
    void should_return_result_when_run_given_free_slot() {
        CpuSlots slots = new CpuSlots(CpuWork.PASSWORD_HASHING, 1, SHORT_WAIT);

        assertThat(slots.run(() -> "done")).isEqualTo("done");
    }

    @Test
    @DisplayName("Given every slot taken for longer than the wait, when more work asks for one, then it is refused as CPU slots full without running")
    void should_refuse_without_running_when_wait_runs_out_given_every_slot_taken() throws Exception {
        CpuSlots slots = new CpuSlots(CpuWork.PASSWORD_HASHING, 1, SHORT_WAIT);
        CountDownLatch holding = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            Future<String> held = executor.submit(() -> slots.run(() -> {
                holding.countDown();
                await(release);
                return "held";
            }));
            assertThat(holding.await(5, TimeUnit.SECONDS)).isTrue();
            boolean[] ran = {false};

            assertThatThrownBy(() -> slots.run(() -> ran[0] = true))
                    .isInstanceOf(CpuSlotsFull.class)
                    .hasMessage("CPU slots of password hashing full");
            assertThat(ran[0]).isFalse();

            release.countDown();
            assertThat(held.get(5, TimeUnit.SECONDS)).isEqualTo("held");
        }
    }

    @Test
    @DisplayName("Given every slot taken, when one frees within the wait, then the waiting work runs")
    void should_run_when_slot_frees_within_wait_given_every_slot_taken() throws Exception {
        CpuSlots slots = new CpuSlots(CpuWork.PASSWORD_HASHING, 1, Duration.ofSeconds(5));
        CountDownLatch holding = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            executor.submit(() -> slots.run(() -> {
                holding.countDown();
                await(release);
                return "held";
            }));
            assertThat(holding.await(5, TimeUnit.SECONDS)).isTrue();
            release.countDown();

            assertThat(slots.run(() -> "waited")).isEqualTo("waited");
        }
    }

    @Test
    @DisplayName("Given work that fails, when it has run, then its slot is free again for the next work")
    void should_free_slot_when_work_failed() {
        CpuSlots slots = new CpuSlots(CpuWork.PASSWORD_HASHING, 1, SHORT_WAIT);

        assertThatThrownBy(() -> slots.run(() -> {
            throw new IllegalStateException("boom");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(slots.run(() -> "next")).isEqualTo("next");
    }

    @Test
    @DisplayName("Given an interrupted thread, when it waits for a slot, then it is refused as CPU slots full and keeps its interrupt")
    void should_refuse_and_keep_interrupt_when_waiting_given_interrupted_thread() {
        CpuSlots slots = new CpuSlots(CpuWork.PASSWORD_HASHING, 1, Duration.ofSeconds(5));
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            CountDownLatch holding = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            executor.submit(() -> slots.run(() -> {
                holding.countDown();
                await(release);
                return "held";
            }));
            await(holding);
            Thread.currentThread().interrupt();
            try {
                assertThatThrownBy(() -> slots.run(() -> "never")).isInstanceOf(CpuSlotsFull.class);
                assertThat(Thread.currentThread().isInterrupted()).isTrue();
            } finally {
                Thread.interrupted();
                release.countDown();
            }
        }
    }

    @Test
    @DisplayName("Given every slot taken and as many waiting as the queue holds, when one more asks, then it is refused at once instead of holding a request thread for the whole wait")
    void should_refuse_at_once_when_queue_is_full_given_every_slot_taken() throws Exception {
        CpuSlots slots = new CpuSlots(CpuWork.PASSWORD_HASHING, 1, Duration.ofSeconds(30), 1);
        CountDownLatch holding = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            executor.submit(() -> slots.run(() -> {
                holding.countDown();
                await(release);
                return "held";
            }));
            assertThat(holding.await(5, TimeUnit.SECONDS)).isTrue();
            Future<String> waiting = executor.submit(() -> slots.run(() -> "waited"));
            awaitQueued(slots);

            long started = System.nanoTime();
            assertThatThrownBy(() -> slots.run(() -> "refused")).isInstanceOf(CpuSlotsFull.class);
            assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(5));

            release.countDown();
            assertThat(waiting.get(5, TimeUnit.SECONDS)).isEqualTo("waited");
        }
    }

    @Test
    @DisplayName("Given slots made for a work, when their queue is read, then it holds four waiting tasks per slot by default")
    void should_queue_four_per_slot_when_made_by_default() {
        assertThat(new CpuSlots(CpuWork.PASSWORD_HASHING, 3, SHORT_WAIT).queueLimit()).isEqualTo(12);
    }

    @Test
    @DisplayName("Given no slot at all, when the slots are made, then they are refused")
    void should_refuse_when_made_given_no_slot() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CpuSlots(CpuWork.PASSWORD_HASHING, 0, SHORT_WAIT));
    }

    private static void awaitQueued(CpuSlots slots) {
        Awaitility.await().atMost(Duration.ofSeconds(5)).until(() -> slots.waiting() > 0);
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AssertionError(e);
        }
    }
}
