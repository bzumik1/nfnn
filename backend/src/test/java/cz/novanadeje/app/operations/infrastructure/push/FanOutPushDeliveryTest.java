package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.application.push.PushPace;
import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.LockSupport;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

class FanOutPushDeliveryTest {

    private static final Instant NOW = Instant.parse("2026-11-12T10:00:00Z");
    private static final VapidKeys KEYS = new VapidKeys("B" + "a".repeat(86), "f".repeat(43));
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final PushMessage TEST = new PushMessage(PushMessageKind.TEST, 0);
    private static final PushMessage DONOR_TEST = new PushMessage(PushMessageKind.DONOR_TEST, 0);

    @AfterEach
    void clearInterruption() {
        Thread.interrupted();
    }

    @Test
    @DisplayName("Given ten devices, when a message is delivered at once, then every delivery runs at the same time, so the slowest service alone bounds the wait")
    void should_deliver_at_once_when_delivered_given_ten_devices() {
        List<PushSubscription> devices = IntStream.range(0, PushSubscription.MAX_PER_ADMINISTRATOR).mapToObj(device -> administratorDevice("device-" + device))
                .toList();
        CountDownLatch together = new CountDownLatch(devices.size());
        FanOutPushDelivery delivery = new FanOutPushDelivery((recipient, message, keys) -> {
            together.countDown();
            try {
                return together.await(5, TimeUnit.SECONDS) ? PushOutcome.DELIVERED : PushOutcome.FAILED;
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return PushOutcome.FAILED;
            }
        }, Duration.ofSeconds(1));

        Map<PushSubscriptionId, PushOutcome> outcomes = delivery.deliver(devices, TEST, KEYS, PushPace.AT_ONCE);

        assertThat(outcomes).hasSize(devices.size()).containsOnlyKeys(devices.stream().map(PushSubscription::id).toList())
                .allSatisfy((id, outcome) -> assertThat(outcome).isEqualTo(PushOutcome.DELIVERED));
    }

    @Test
    @DisplayName("Given a device whose push service throws, when a message is delivered to three devices, then that one counts as failed and the others are still delivered")
    void should_count_failed_and_deliver_rest_when_delivered_given_delivery_that_throws() {
        PushSubscription first = administratorDevice("first");
        PushSubscription throwing = administratorDevice("throwing");
        PushSubscription last = administratorDevice("last");
        FanOutPushDelivery delivery = new FanOutPushDelivery((recipient, message, keys) -> {
            if (recipient.id().equals(throwing.id())) {
                throw new IllegalStateException("The push service could not be reached");
            }
            return PushOutcome.DELIVERED;
        }, Duration.ZERO);

        for (PushPace pace : PushPace.values()) {
            assertThat(delivery.deliver(List.of(first, throwing, last), TEST, KEYS, pace)).as("%s", pace)
                    .containsExactly(entry(first.id(), PushOutcome.DELIVERED), entry(throwing.id(), PushOutcome.FAILED), entry(last.id(), PushOutcome.DELIVERED));
        }
    }

    @Test
    @DisplayName("Given twenty devices whose push services answer slowly, when they are sent a paced notification, then at most eight sends run at once, every device gets it and the one that failed is reported failed")
    void should_send_at_most_eight_at_once_when_paced_given_many_devices() {
        List<DonorPushSubscription> devices = IntStream.range(0, 20).mapToObj(index -> donorDevice("jana-" + index)).toList();
        AtomicInteger running = new AtomicInteger();
        AtomicInteger mostAtOnce = new AtomicInteger();
        FanOutPushDelivery delivery = new FanOutPushDelivery((recipient, message, keys) -> {
            mostAtOnce.accumulateAndGet(running.incrementAndGet(), Math::max);
            LockSupport.parkNanos(Duration.ofMillis(20).toNanos());
            running.decrementAndGet();
            return recipient.id().equals(devices.getLast().id()) ? PushOutcome.FAILED : PushOutcome.DELIVERED;
        }, Duration.ZERO);

        Map<PushSubscriptionId, PushOutcome> outcomes = delivery.deliver(devices, DONOR_TEST, KEYS, PushPace.PACED);

        assertThat(outcomes).hasSize(20).containsEntry(devices.getLast().id(), PushOutcome.FAILED);
        assertThat(outcomes.values()).filteredOn(PushOutcome.DELIVERED::equals).hasSize(19);
        assertThat(mostAtOnce.get()).isBetween(2, FanOutPushDelivery.PACED_SENDS_AT_ONCE);
    }

    @Test
    @DisplayName("Given three devices, when they are sent a notification with a gap between starts, then the sending takes at least the two gaps between the three starts")
    void should_keep_the_gap_between_starts_when_sent_given_three_devices() {
        List<DonorPushSubscription> devices = List.of(donorDevice("jana-1"), donorDevice("jana-2"), donorDevice("jana-3"));
        Duration gap = Duration.ofMillis(30);
        FanOutPushDelivery delivery = new FanOutPushDelivery((recipient, message, keys) -> PushOutcome.DELIVERED, gap);

        long started = System.nanoTime();
        Map<PushSubscriptionId, PushOutcome> outcomes = delivery.deliver(devices, DONOR_TEST, KEYS, PushPace.PACED);
        long took = System.nanoTime() - started;

        assertThat(outcomes).hasSize(3);
        assertThat(took).isGreaterThanOrEqualTo(gap.multipliedBy(2).toNanos());
    }

    @Test
    @DisplayName("Given a thread already interrupted, when it starts a paced notification, then no send starts and no outcome is reported")
    void should_start_nothing_when_paced_given_interrupted_thread() {
        AtomicInteger sends = new AtomicInteger();
        FanOutPushDelivery delivery = new FanOutPushDelivery((recipient, message, keys) -> {
            sends.incrementAndGet();
            return PushOutcome.DELIVERED;
        }, Duration.ZERO);
        Thread.currentThread().interrupt();

        Map<PushSubscriptionId, PushOutcome> outcomes = delivery.deliver(List.of(donorDevice("jana-1"), donorDevice("jana-2")), DONOR_TEST, KEYS,
                PushPace.PACED);

        assertThat(outcomes).isEmpty();
        assertThat(sends).hasValue(0);
        assertThat(Thread.currentThread().isInterrupted()).isTrue();
    }

    @Test
    @DisplayName("Given a thread interrupted while it waits, when a message is delivered at once, then no outcome it could not read is reported and the interruption stays")
    void should_report_no_unread_outcome_when_delivered_at_once_given_interrupted_thread() {
        CountDownLatch neverAnswered = new CountDownLatch(1);
        FanOutPushDelivery delivery = new FanOutPushDelivery((recipient, message, keys) -> {
            try {
                neverAnswered.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException stopped) {
                Thread.currentThread().interrupt();
            }
            return PushOutcome.DELIVERED;
        }, Duration.ZERO);
        Thread.currentThread().interrupt();

        Map<PushSubscriptionId, PushOutcome> outcomes = delivery.deliver(List.of(administratorDevice("first"), administratorDevice("second")), TEST, KEYS,
                PushPace.AT_ONCE);

        assertThat(outcomes).isEmpty();
        assertThat(Thread.currentThread().isInterrupted()).isTrue();
    }

    private static PushSubscription administratorDevice(String name) {
        return PushSubscription.subscribe(UUID.randomUUID(), UUID.randomUUID(), new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT,
                PushAlerts.ALL, NOW);
    }

    private static DonorPushSubscription donorDevice(String name) {
        return DonorPushSubscription.subscribe(UUID.randomUUID(), UUID.randomUUID(), new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT,
                DonorNotifications.ALL, NOW);
    }
}
