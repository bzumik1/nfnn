package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import cz.novanadeje.app.shared.application.event.DonationsArrived;
import cz.novanadeje.app.shared.application.session.SignedInDevice;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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
    @DisplayName("Given a device whose push service keeps failing beside one that works, when gifts arrive, then only the failing one is tried again after 1, 5 and 15 minutes and then no more")
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
        assertThat(sent).containsExactlyInAnyOrder("jana-telefon gift-arrived", "jana-notebook gift-arrived", "jana-notebook gift-arrived",
                "jana-notebook gift-arrived", "jana-notebook gift-arrived");
    }

    private DonorPushDispatcher dispatcher() {
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
        return new DonorPushDispatcher(subscriptions, sender, new SignedInDevicesOf(signedIn), timer, transactions, clock);
    }

    private DonorPushSubscription subscribed(UUID donor, String name, boolean gifts) {
        DonorPushSubscription subscription = DonorPushSubscription.subscribe(donor, UUID.randomUUID(),
                new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT, new DonorNotifications(gifts, true), NOW);
        subscriptions.save(subscription);
        signedIn.add(subscription.deviceId());
        return subscription;
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
