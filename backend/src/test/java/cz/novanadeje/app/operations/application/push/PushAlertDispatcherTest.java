package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.application.alerts.InMemoryOperationalAlerts;
import cz.novanadeje.app.operations.application.alerts.OperationalAlertService;
import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
import cz.novanadeje.app.operations.application.settings.CarriedSettingsKeyService;
import cz.novanadeje.app.operations.application.settings.ReversibleSealer;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
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
import cz.novanadeje.app.shared.application.event.OperationalAlertRaised;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class PushAlertDispatcherTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);
    private static final VapidKeys KEYS = new VapidKeys("B" + "a".repeat(86), "f".repeat(43));
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");

    private final InMemoryPushSubscriptions subscriptions = new InMemoryPushSubscriptions();
    private final InMemoryOperationalAlerts alertRows = new InMemoryOperationalAlerts();
    private final OperationalAlertService alerts = new OperationalAlertService(alertRows, event -> {
    });
    private final Map<PushEndpoint, PushOutcome> outcomes = new ConcurrentHashMap<>();
    private final List<Delivered> delivered = new ArrayList<>();
    private final RecordingRetryTimer timer = new RecordingRetryTimer();
    private final PushSender sender = new PushSender((subscription, message, keys) -> {
        synchronized (delivered) {
            delivered.add(new Delivered(subscription.endpoint(), message));
        }
        return outcomes.getOrDefault(subscription.endpoint(), PushOutcome.DELIVERED);
    }, new PushKeyService(new StoredKey(), subscriptions, new InMemoryDonorPushSubscriptions(), new ReversibleSealer(), () -> KEYS, mock(CarriedSettingsKeyService.class), CLOCK),
            subscriptions, new TransactionTemplate(mock(PlatformTransactionManager.class)), CLOCK);
    private final PushAlertDispatcher dispatcher = new PushAlertDispatcher(sender, subscriptions, alerts, timer, CLOCK);

    @Test
    @DisplayName("Given devices with and without bank import alerts, when the bank import alert opens, then only the devices that want it get the outage with the open count")
    void should_send_to_devices_that_want_the_area_when_opened_given_mixed_switches() {
        PushSubscription wants = subscribed("wants", PushAlerts.ALL);
        subscribed("mail-only", new PushAlerts(false, false, true));

        dispatcher.on(opened(MonitoredArea.BANK_IMPORT));

        assertThat(delivered).containsExactly(new Delivered(wants.endpoint(), new PushMessage(PushMessageKind.BANK_IMPORT_OUTAGE, 1)));
        assertThat(timer.scheduled()).isEmpty();
    }

    @Test
    @DisplayName("Given a resolved mail alert, when the change is dispatched, then the devices get the recovery with the count still open")
    void should_send_recovery_when_resolved_given_mail_alert() {
        PushSubscription device = subscribed("device", PushAlerts.ALL);
        alerts.record(MonitoredArea.MAIL, true, NOW);
        alerts.record(MonitoredArea.BACKUPS, true, NOW);
        alerts.record(MonitoredArea.MAIL, false, NOW);

        dispatcher.on(new OperationalAlertChanged(MonitoredArea.MAIL, false, 2, 1, NOW));

        assertThat(delivered).containsExactly(new Delivered(device.endpoint(), new PushMessage(PushMessageKind.MAIL_RECOVERED, 1)));
    }

    @Test
    @DisplayName("Given a device whose push service fails, when the alert opens, then only that device is tried again after 1, 5 and 15 minutes and then given up")
    void should_retry_only_failed_device_three_times_when_opened_given_failing_service() {
        PushSubscription working = subscribed("working", PushAlerts.ALL);
        PushSubscription failing = subscribed("failing", PushAlerts.ALL);
        outcomes.put(failing.endpoint(), PushOutcome.FAILED);
        OperationalAlertChanged changed = opened(MonitoredArea.BACKUPS);

        dispatcher.on(changed);
        assertThat(timer.scheduled()).extracting(RecordingRetryTimer.Scheduled::when).containsExactly(NOW.plus(Duration.ofMinutes(1)));
        timer.fireNext();
        assertThat(timer.scheduled()).extracting(RecordingRetryTimer.Scheduled::when).containsExactly(NOW.plus(Duration.ofMinutes(5)));
        timer.fireNext();
        assertThat(timer.scheduled()).extracting(RecordingRetryTimer.Scheduled::when).containsExactly(NOW.plus(Duration.ofMinutes(15)));
        timer.fireNext();

        assertThat(timer.scheduled()).isEmpty();
        assertThat(delivered).extracting(Delivered::endpoint).containsExactlyInAnyOrder(working.endpoint(), failing.endpoint(),
                failing.endpoint(), failing.endpoint(), failing.endpoint());
    }

    @Test
    @DisplayName("Given a retry waiting, when the push service delivers it, then nothing more is scheduled")
    void should_stop_retrying_when_delivered_given_retry_waiting() {
        PushSubscription device = subscribed("device", PushAlerts.ALL);
        outcomes.put(device.endpoint(), PushOutcome.FAILED);
        dispatcher.on(opened(MonitoredArea.MAIL));
        outcomes.remove(device.endpoint());

        timer.fireNext();

        assertThat(timer.scheduled()).isEmpty();
        assertThat(delivered).hasSize(2);
    }

    @Test
    @DisplayName("Given a retry of an outage waiting, when the alert is resolved before it is due, then the outdated outage is not sent again")
    void should_drop_retry_when_due_given_alert_changed_meanwhile() {
        PushSubscription device = subscribed("device", PushAlerts.ALL);
        outcomes.put(device.endpoint(), PushOutcome.FAILED);
        dispatcher.on(opened(MonitoredArea.BANK_IMPORT));
        alerts.record(MonitoredArea.BANK_IMPORT, false, NOW.plusSeconds(30));

        timer.fireNext();

        assertThat(delivered).hasSize(1);
        assertThat(timer.scheduled()).isEmpty();
    }

    @Test
    @DisplayName("Given a retry waiting, when the device turned the alert off or was removed meanwhile, then nothing is sent")
    void should_send_nothing_when_retried_given_device_gone_meanwhile() {
        PushSubscription device = subscribed("device", PushAlerts.ALL);
        outcomes.put(device.endpoint(), PushOutcome.FAILED);
        dispatcher.on(opened(MonitoredArea.MAIL));
        subscriptions.delete(device.id());

        timer.fireNext();

        assertThat(delivered).hasSize(1);
    }

    @Test
    @DisplayName("Given no device wants the area, when the alert opens, then the server's keys are not even read")
    void should_send_nothing_when_opened_given_no_device() {
        subscribed("backups-only", new PushAlerts(false, true, false));

        dispatcher.on(opened(MonitoredArea.BANK_IMPORT));

        assertThat(delivered).isEmpty();
    }

    private OperationalAlertChanged opened(MonitoredArea area) {
        alerts.on(OperationalAlertRaised.opened(switch (area) {
            case BANK_IMPORT -> OperationalAlertRaised.Area.BANK_IMPORT;
            case BACKUPS -> OperationalAlertRaised.Area.BACKUPS;
            case MAIL -> OperationalAlertRaised.Area.MAIL;
        }, NOW));
        long changes = alertRows.find(area).orElseThrow().changes();
        return new OperationalAlertChanged(area, true, changes, (int) alerts.open().size(), NOW);
    }

    private PushSubscription subscribed(String name, PushAlerts wanted) {
        PushSubscription subscription = PushSubscription.subscribe(UUID.randomUUID(), UUID.randomUUID(),
                new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT, wanted, NOW);
        subscriptions.save(subscription);
        return subscription;
    }

    private record Delivered(PushEndpoint endpoint, PushMessage message) {
    }

    private static final class StoredKey implements PushKeyRepository {

        private Optional<PushKey> stored = Optional.empty();

        @Override
        public Optional<PushKey> find() {
            return stored;
        }

        @Override
        public Optional<PushKey> findLocked() {
            return stored;
        }

        @Override
        public void insertIfAbsent(PushKey key) {
            if (stored.isEmpty()) {
                stored = Optional.of(key);
            }
        }

        @Override
        public void replace(PushKey key) {
            stored = Optional.of(key);
        }
    }
}
