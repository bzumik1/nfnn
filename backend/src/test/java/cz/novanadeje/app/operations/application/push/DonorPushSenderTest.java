package cz.novanadeje.app.operations.application.push;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.LockSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DonorPushSenderTest {

    private static final Instant NOW = Instant.parse("2026-11-12T10:00:00Z");
    private static final VapidKeys KEYS = new VapidKeys("B" + "a".repeat(86), "f".repeat(43));
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID JANA = UUID.randomUUID();
    private static final UUID PHONE = UUID.randomUUID();
    private static final PushMessage TEST = new PushMessage(PushMessageKind.DONOR_TEST, 0);

    private final AtomicReference<PushOutcome> answer = new AtomicReference<>(PushOutcome.FAILED);
    private final InMemoryDonorPushSubscriptions subscriptions = new InMemoryDonorPushSubscriptions();
    private final PushKeyService keys = mock(PushKeyService.class);
    private final ListAppender<ILoggingEvent> log = new ListAppender<>();

    @BeforeEach
    void captureLog() {
        when(keys.current()).thenReturn(KEYS);
        log.start();
        logger().addAppender(log);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(log);
    }

    @Test
    @DisplayName("Given a device whose push service keeps failing, when a notification fails the third time in a row, then one warning names the subscription by its id and the count")
    void should_warn_once_when_tested_given_third_failure_in_a_row() {
        DonorPushSubscription phone = subscribed();
        DonorPushSender sender = sender(subscriptions);

        for (int attempt = 0; attempt < 4; attempt++) {
            assertThat(sender.send(List.of(phone), TEST).report()).isEqualTo(new PushDeliveryReport(0, 1, 0));
        }

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel().toString()).isEqualTo("WARN");
            assertThat(event.getFormattedMessage()).isEqualTo("Push subscription " + phone.id().value() + " failed 3 times in a row");
        });
    }

    @Test
    @DisplayName("Given a notification the push service took, when its outcome cannot be written, then it still counts as delivered")
    void should_report_delivery_when_sent_given_outcome_not_written() {
        DonorPushSubscription phone = subscribed();
        answer.set(PushOutcome.DELIVERED);
        InMemoryDonorPushSubscriptions unwritable = new InMemoryDonorPushSubscriptions() {
            @Override
            public synchronized void markDelivered(PushSubscriptionId id, Instant at) {
                throw new IllegalStateException("The database is busy");
            }
        };
        subscriptions.all().forEach(unwritable::save);

        assertThat(sender(unwritable).send(List.of(phone), TEST).report()).isEqualTo(new PushDeliveryReport(1, 0, 0));
    }

    @Test
    @DisplayName("Given twenty devices whose push services answer slowly, when they are sent a notification, then at most eight sends run at once, every device gets it and the one that failed is named for a retry")
    void should_send_at_most_eight_at_once_when_sent_given_many_devices() {
        List<DonorPushSubscription> devices = new ArrayList<>();
        for (int index = 0; index < 20; index++) {
            devices.add(subscribed(UUID.randomUUID(), "jana-" + index));
        }
        AtomicInteger running = new AtomicInteger();
        AtomicInteger mostAtOnce = new AtomicInteger();
        DonorPushSender sender = sender(subscriptions, (recipient, message, vapid) -> {
            mostAtOnce.accumulateAndGet(running.incrementAndGet(), Math::max);
            LockSupport.parkNanos(Duration.ofMillis(20).toNanos());
            running.decrementAndGet();
            return recipient.id().equals(devices.getLast().id()) ? PushOutcome.FAILED : PushOutcome.DELIVERED;
        });

        PushAttempt sent = sender.send(devices, TEST);

        assertThat(sent.report()).isEqualTo(new PushDeliveryReport(19, 1, 0));
        assertThat(sent.failed()).containsExactly(devices.getLast().id());
        assertThat(mostAtOnce.get()).isBetween(2, DonorPushSender.SENDS_AT_ONCE);
    }

    @Test
    @DisplayName("Given three devices, when they are sent a notification with a gap between starts, then the sending takes at least the two gaps between the three starts")
    void should_keep_the_gap_between_starts_when_sent_given_three_devices() {
        List<DonorPushSubscription> devices = List.of(subscribed(UUID.randomUUID(), "jana-1"), subscribed(UUID.randomUUID(), "jana-2"),
                subscribed(UUID.randomUUID(), "jana-3"));
        Duration gap = Duration.ofMillis(30);
        DonorPushSender sender = new DonorPushSender((recipient, message, vapid) -> PushOutcome.DELIVERED, keys, subscriptions,
                new TransactionTemplate(mock(PlatformTransactionManager.class)), Clock.fixed(NOW, ZoneOffset.UTC), gap);

        long started = System.nanoTime();
        PushAttempt sent = sender.send(devices, TEST);
        long took = System.nanoTime() - started;

        assertThat(sent.report()).isEqualTo(new PushDeliveryReport(3, 0, 0));
        assertThat(took).isGreaterThanOrEqualTo(gap.multipliedBy(2).toNanos());
    }

    private DonorPushSender sender(InMemoryDonorPushSubscriptions stored, PushDelivery delivery) {
        return new DonorPushSender(delivery, keys, stored, new TransactionTemplate(mock(PlatformTransactionManager.class)), Clock.fixed(NOW, ZoneOffset.UTC),
                Duration.ZERO);
    }

    private DonorPushSender sender(InMemoryDonorPushSubscriptions stored) {
        return sender(stored, (recipient, message, vapid) -> answer.get());
    }

    private DonorPushSubscription subscribed() {
        return subscribed(PHONE, "jana");
    }

    private DonorPushSubscription subscribed(UUID device, String name) {
        DonorPushSubscription subscription = DonorPushSubscription.subscribe(JANA, device, new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name),
                CLIENT, DonorNotifications.ALL, NOW);
        subscriptions.save(subscription);
        return subscription;
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(DonorPushSender.class);
    }
}
