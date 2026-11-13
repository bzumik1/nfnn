package cz.novanadeje.app.operations.application.push;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import cz.novanadeje.app.shared.application.event.DonationsArrived;
import cz.novanadeje.app.shared.application.event.YearlyReceiptsReady;
import cz.novanadeje.app.shared.application.session.SignedInDevice;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
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
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DonorPushDispatcherTest {

    private static final Instant NOW = Instant.parse("2026-11-12T10:00:00Z");
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID JANA = UUID.randomUUID();
    private static final UUID PETR = UUID.randomUUID();

    private final InMemoryDonorPushSubscriptions subscriptions = new InMemoryDonorPushSubscriptions();
    private final Set<UUID> signedIn = new HashSet<>();
    private final Set<PushEndpoint> failing = new HashSet<>();
    private final List<String> sent = new ArrayList<>();
    private final RecordingRetryTimer timer = new RecordingRetryTimer();
    private final DonorPushDispatcher dispatcher = dispatcher();
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
    @DisplayName("Given the donors of new gifts with devices that want them, one that does not and another donor's, when the gifts arrive, then only the wanting devices of those donors get one gift-arrived message each")
    void should_tell_only_wanting_devices_of_the_donors_when_gifts_arrive() {
        subscribed(JANA, "jana-telefon", true);
        subscribed(JANA, "jana-notebook", false);
        subscribed(PETR, "petr-telefon", true);
        subscribed(UUID.randomUUID(), "eva-telefon", true);

        dispatcher.on(new DonationsArrived(Set.of(JANA, PETR), NOW));

        assertThat(sent).containsExactlyInAnyOrder("jana-telefon gift-arrived", "petr-telefon gift-arrived");
        assertThat(timer.scheduled()).isEmpty();
    }

    @Test
    @DisplayName("Given devices with the yearly receipt switch on and off, when yearly receipts are ready for their donor, then only the device that wants them gets one yearly-receipt-ready message")
    void should_tell_only_devices_wanting_yearly_receipts_when_receipts_ready() {
        subscribed(JANA, "jana-telefon", true);
        DonorPushSubscription notebook = subscribed(JANA, "jana-notebook", true);
        subscriptions.changeNotifications(JANA, notebook.deviceId(), new DonorNotifications(true, false));

        dispatcher.on(new YearlyReceiptsReady(Set.of(JANA), NOW));

        assertThat(sent).containsExactly("jana-telefon yearly-receipt-ready");
    }

    @Test
    @DisplayName("Given a subscription whose device is no longer signed in, when gifts arrive, then it is removed and gets nothing")
    void should_remove_leftover_when_gifts_arrive_given_device_no_longer_signed_in() {
        DonorPushSubscription telefon = subscribed(JANA, "jana-telefon", true);
        DonorPushSubscription leftover = subscribed(JANA, "jana-stary", true);
        signedIn.remove(leftover.deviceId());

        dispatcher.on(new DonationsArrived(Set.of(JANA), NOW));

        assertThat(sent).containsExactly("jana-telefon gift-arrived");
        assertThat(subscriptions.all()).extracting(DonorPushSubscription::id).containsExactly(telefon.id());
    }

    @Test
    @DisplayName("Given a device whose push service keeps failing beside one that works, when gifts arrive, then only the failing one is tried again after 1, 5 and 15 minutes, then no more, and one warning says how many devices were given up")
    void should_retry_only_failing_device_three_times_when_gifts_arrive() {
        subscribed(JANA, "jana-telefon", true);
        subscribed(JANA, "jana-notebook", true);
        failing.add(new PushEndpoint("https://fcm.googleapis.com/fcm/send/jana-notebook"));

        dispatcher.on(new DonationsArrived(Set.of(JANA), NOW));
        List<Duration> delays = new ArrayList<>();
        while (!timer.scheduled().isEmpty()) {
            delays.add(Duration.between(NOW, timer.scheduled().getFirst().when()));
            timer.fireNext();
        }

        assertThat(delays).containsExactly(Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(15));
        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel().toString()).isEqualTo("WARN");
            assertThat(event.getFormattedMessage()).isEqualTo("Push notification GIFT_ARRIVED gave up on 1 devices after 4 attempts");
        });
        assertThat(sent).containsExactlyInAnyOrder("jana-telefon gift-arrived", "jana-notebook gift-arrived", "jana-notebook gift-arrived",
                "jana-notebook gift-arrived", "jana-notebook gift-arrived");
    }

    @Test
    @DisplayName("Given a retry that comes while the server stops and its executor refuses work, when the retry is due, then one warning names the attempt and the refusal, and nothing else happens")
    void should_warn_when_retried_given_executor_refuses_the_round() {
        subscribed(JANA, "jana-notebook", true);
        failing.add(new PushEndpoint("https://fcm.googleapis.com/fcm/send/jana-notebook"));
        DonorPushDispatcher stopping = dispatcher(task -> {
            throw new IllegalStateException("The executor has stopped");
        });

        stopping.on(new DonationsArrived(Set.of(JANA), NOW));
        timer.fireNext();

        assertThat(sent).containsExactly("jana-notebook gift-arrived");
        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel().toString()).isEqualTo("WARN");
            assertThat(event.getFormattedMessage()).isEqualTo("Push notification GIFT_ARRIVED attempt 2 could not be sent: IllegalStateException");
        });
    }

    private DonorPushDispatcher dispatcher() {
        return dispatcher(Runnable::run);
    }

    private DonorPushDispatcher dispatcher(Executor rounds) {
        PushKeyService keys = mock(PushKeyService.class);
        when(keys.current()).thenReturn(new VapidKeys("B" + "a".repeat(86), "f".repeat(43)));
        TransactionTemplate transactions = new TransactionTemplate(mock(PlatformTransactionManager.class));
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        DonorPushSender sender = new DonorPushSender((recipient, message, vapid) -> {
            synchronized (sent) {
                sent.add(recipient.endpoint().value().substring("https://fcm.googleapis.com/fcm/send/".length()) + " " + message.kind().token());
            }
            return failing.contains(recipient.endpoint()) ? PushOutcome.FAILED : PushOutcome.DELIVERED;
        }, keys, subscriptions, transactions, clock, Duration.ZERO);
        return new DonorPushDispatcher(subscriptions, sender, new SignedInDevicesOf(signedIn), timer, rounds, transactions, clock);
    }

    private DonorPushSubscription subscribed(UUID donor, String name, boolean gifts) {
        DonorPushSubscription subscription = DonorPushSubscription.subscribe(donor, UUID.randomUUID(),
                new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT, new DonorNotifications(gifts, true), NOW);
        subscriptions.save(subscription);
        signedIn.add(subscription.deviceId());
        return subscription;
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(DonorPushDispatcher.class);
    }

    private record SignedInDevicesOf(Set<UUID> signedIn) implements SignedInDevices {

        @Override
        public SignedInDevice holdSignedIn(UUID donorId, UUID deviceId) {
            return new SignedInDevice(false);
        }

        @Override
        public Set<UUID> signedInAmong(Collection<UUID> deviceIds) {
            return deviceIds.stream().filter(signedIn::contains).collect(Collectors.toUnmodifiableSet());
        }
    }
}
