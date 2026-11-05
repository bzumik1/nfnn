package cz.novanadeje.app.operations.application.push;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.settings.CarriedSettingsKeyService;
import cz.novanadeje.app.operations.application.settings.ReversibleSealer;
import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushKey;
import cz.novanadeje.app.operations.domain.push.PushKeyRepository;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class PushSenderTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final VapidKeys KEYS = new VapidKeys("B" + "a".repeat(86), "f".repeat(43));
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID ADMIN = UUID.randomUUID();

    private final InMemoryPushSubscriptions subscriptions = new InMemoryPushSubscriptions();
    private final Map<PushEndpoint, PushOutcome> outcomes = new ConcurrentHashMap<>();
    private final Set<PushEndpoint> throwing = ConcurrentHashMap.newKeySet();
    private final AtomicReference<CountDownLatch> allStarted = new AtomicReference<>();
    private final ListAppender<ILoggingEvent> log = new ListAppender<>();
    private final PushSender sender = new PushSender((subscription, message, keys) -> deliverTo(subscription),
            new PushKeyService(new StoredKey(), subscriptions, new ReversibleSealer(), () -> KEYS, mock(CarriedSettingsKeyService.class), Clock.fixed(NOW, ZoneOffset.UTC)),
            subscriptions, new TransactionTemplate(mock(PlatformTransactionManager.class)), Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void captureLog() {
        log.start();
        ((Logger) LoggerFactory.getLogger(PushSender.class)).addAppender(log);
    }

    @AfterEach
    void releaseLog() {
        ((Logger) LoggerFactory.getLogger(PushSender.class)).detachAppender(log);
    }

    @Test
    @DisplayName("Given three subscriptions, when the push services deliver one, answer gone for one and fail one, then they are marked delivered, removed and counted as failed")
    void should_record_each_outcome_when_sent_given_three_subscriptions() {
        PushSubscription delivered = subscribed("delivered");
        PushSubscription gone = subscribed("gone");
        PushSubscription failing = subscribed("failing");
        outcomes.put(gone.endpoint(), PushOutcome.GONE);
        outcomes.put(failing.endpoint(), PushOutcome.FAILED);

        PushDeliveryReport report = sender.send(List.of(delivered, gone, failing), new PushMessage(PushMessageKind.TEST, 0));

        assertThat(report).isEqualTo(new PushDeliveryReport(1, 1, 1));
        assertThat(subscriptions.findById(delivered.id())).get().satisfies(row -> {
            assertThat(row.lastDeliveredAt()).contains(NOW);
            assertThat(row.failuresInARow()).isZero();
        });
        assertThat(subscriptions.findById(gone.id())).isEmpty();
        assertThat(subscriptions.findById(failing.id())).get().extracting(PushSubscription::failuresInARow).isEqualTo(1);
        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given a subscription that keeps failing, when the third send in a row fails, then one warning names only its id, and a later delivery resets the count")
    void should_warn_once_when_failing_given_three_failures_in_a_row() {
        PushSubscription failing = subscribed("failing");
        outcomes.put(failing.endpoint(), PushOutcome.FAILED);

        for (int send = 0; send < 4; send++) {
            sender.send(List.of(failing), new PushMessage(PushMessageKind.TEST, 0));
        }
        outcomes.remove(failing.endpoint());
        sender.send(List.of(failing), new PushMessage(PushMessageKind.TEST, 0));

        assertThat(log.list).singleElement().extracting(ILoggingEvent::getFormattedMessage)
                .isEqualTo("Push subscription " + failing.id().value() + " failed 3 times in a row");
        assertThat(subscriptions.findById(failing.id())).get().extracting(PushSubscription::failuresInARow).isEqualTo(0);
    }

    @Test
    @DisplayName("Given a subscription removed while its message was on the way, when the delivery or failure is recorded, then it stays removed")
    void should_not_bring_back_when_recorded_given_removed_meanwhile() {
        PushSubscription delivered = subscribed("delivered");
        PushSubscription failing = subscribed("failing");
        outcomes.put(failing.endpoint(), PushOutcome.FAILED);
        subscriptions.deleteAll();

        sender.send(List.of(delivered, failing), new PushMessage(PushMessageKind.TEST, 0));

        assertThat(subscriptions.all()).isEmpty();
    }

    @Test
    @DisplayName("Given a delivery that throws, when a message is sent to three devices, then that one counts as failed and the others are still delivered")
    void should_count_failed_and_deliver_rest_when_sent_given_delivery_that_throws() {
        PushSubscription first = subscribed("first");
        PushSubscription throwingOne = subscribed("throwing");
        PushSubscription last = subscribed("last");
        throwing.add(throwingOne.endpoint());

        PushDeliveryReport report = sender.send(List.of(first, throwingOne, last), new PushMessage(PushMessageKind.TEST, 0));

        assertThat(report).isEqualTo(new PushDeliveryReport(2, 1, 0));
        assertThat(subscriptions.findById(throwingOne.id())).get().extracting(PushSubscription::failuresInARow).isEqualTo(1);
        assertThat(subscriptions.findById(last.id())).get().extracting(PushSubscription::lastDeliveredAt).isEqualTo(Optional.of(NOW));
    }

    @Test
    @DisplayName("Given ten devices, when a message is sent, then every delivery runs at the same time, so the slowest service alone bounds the wait")
    void should_deliver_at_once_when_sent_given_ten_devices() {
        List<PushSubscription> devices = java.util.stream.IntStream.range(0, PushSubscription.MAX_PER_ADMINISTRATOR)
                .mapToObj(device -> subscribed("device-" + device)).toList();
        allStarted.set(new CountDownLatch(devices.size()));

        PushDeliveryReport report = sender.send(devices, new PushMessage(PushMessageKind.TEST, 0));

        assertThat(report).isEqualTo(new PushDeliveryReport(devices.size(), 0, 0));
    }

    @Test
    @DisplayName("Given no subscriptions, when a message is sent, then nothing is delivered")
    void should_send_nothing_when_sent_given_no_subscriptions() {
        assertThat(sender.send(List.of(), new PushMessage(PushMessageKind.TEST, 0))).isEqualTo(PushDeliveryReport.NONE);
    }

    private PushOutcome deliverTo(PushSubscription subscription) {
        if (throwing.contains(subscription.endpoint())) {
            throw new IllegalStateException("The push service could not be reached");
        }
        CountDownLatch together = allStarted.get();
        if (together != null) {
            together.countDown();
            try {
                return together.await(5, TimeUnit.SECONDS) ? PushOutcome.DELIVERED : PushOutcome.FAILED;
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return PushOutcome.FAILED;
            }
        }
        return outcomes.getOrDefault(subscription.endpoint(), PushOutcome.DELIVERED);
    }

    private PushSubscription subscribed(String name) {
        PushSubscription subscription = PushSubscription.subscribe(ADMIN, UUID.randomUUID(), new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name),
                CLIENT, PushAlerts.ALL, NOW);
        subscriptions.save(subscription);
        return subscription;
    }

    private static final class StoredKey implements PushKeyRepository {

        private Optional<PushKey> key = Optional.empty();

        @Override
        public Optional<PushKey> find() {
            return key;
        }

        @Override
        public Optional<PushKey> findLocked() {
            return key;
        }

        @Override
        public void insertIfAbsent(PushKey stored) {
            if (key.isEmpty()) {
                key = Optional.of(stored);
            }
        }

        @Override
        public void replace(PushKey stored) {
            key = Optional.of(stored);
        }
    }
}
