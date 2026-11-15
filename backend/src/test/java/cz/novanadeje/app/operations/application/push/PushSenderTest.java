package cz.novanadeje.app.operations.application.push;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushRecipient;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
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
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PushSenderTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final VapidKeys KEYS = new VapidKeys("B" + "a".repeat(86), "f".repeat(43));
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID ADMIN = UUID.randomUUID();
    private static final UUID JANA = UUID.randomUUID();
    private static final PushMessage TEST = new PushMessage(PushMessageKind.TEST, 0);
    private static final PushMessage DONOR_TEST = new PushMessage(PushMessageKind.DONOR_TEST, 0);

    private final InMemoryPushSubscriptions administrators = new InMemoryPushSubscriptions();
    private final InMemoryDonorPushSubscriptions donors = new InMemoryDonorPushSubscriptions();
    private final Map<PushEndpoint, PushOutcome> outcomes = new LinkedHashMap<>();
    private final Set<PushEndpoint> unread = new HashSet<>();
    private final List<PushPace> paces = new ArrayList<>();
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
    @DisplayName("Given three subscriptions, when the push services deliver one, answer gone for one and fail one, then they are marked delivered, removed and counted as failed")
    void should_record_each_outcome_when_sent_given_three_subscriptions() {
        PushSubscription delivered = administratorDevice("delivered");
        PushSubscription gone = administratorDevice("gone");
        PushSubscription failing = administratorDevice("failing");
        outcomes.put(gone.endpoint(), PushOutcome.GONE);
        outcomes.put(failing.endpoint(), PushOutcome.FAILED);

        PushDeliveryReport report = sender(administrators, donors).toAdministrators(List.of(delivered, gone, failing), TEST).report();

        assertThat(report).isEqualTo(new PushDeliveryReport(1, 1, 1));
        assertThat(administrators.findById(delivered.id())).get().satisfies(row -> {
            assertThat(row.lastDeliveredAt()).contains(NOW);
            assertThat(row.failuresInARow()).isZero();
        });
        assertThat(administrators.findById(gone.id())).isEmpty();
        assertThat(administrators.findById(failing.id())).get().extracting(PushSubscription::failuresInARow).isEqualTo(1);
        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given a subscription that keeps failing, when the third send in a row fails, then one warning names only its id, and a later delivery resets the count")
    void should_warn_once_when_failing_given_three_failures_in_a_row() {
        PushSubscription failing = administratorDevice("failing");
        outcomes.put(failing.endpoint(), PushOutcome.FAILED);
        PushSender sender = sender(administrators, donors);

        for (int send = 0; send < 4; send++) {
            sender.toAdministrators(List.of(failing), TEST);
        }
        outcomes.remove(failing.endpoint());
        sender.toAdministrators(List.of(failing), TEST);

        assertThat(log.list).singleElement().extracting(ILoggingEvent::getFormattedMessage)
                .isEqualTo("Push subscription " + failing.id().value() + " failed 3 times in a row");
        assertThat(administrators.findById(failing.id())).get().extracting(PushSubscription::failuresInARow).isEqualTo(0);
    }

    @Test
    @DisplayName("Given a subscription removed while its message was on the way, when the delivery or failure is recorded, then it stays removed")
    void should_not_bring_back_when_recorded_given_removed_meanwhile() {
        PushSubscription delivered = administratorDevice("delivered");
        PushSubscription failing = administratorDevice("failing");
        outcomes.put(failing.endpoint(), PushOutcome.FAILED);
        administrators.deleteAll();

        sender(administrators, donors).toAdministrators(List.of(delivered, failing), TEST);

        assertThat(administrators.all()).isEmpty();
    }

    @Test
    @DisplayName("Given a delivered, a gone and two failing devices, when a message is attempted, then the attempt names both failing ones to try again in their order")
    void should_name_failed_devices_when_attempted_given_mixed_outcomes() {
        PushSubscription delivered = administratorDevice("delivered");
        PushSubscription gone = administratorDevice("gone");
        PushSubscription failing = administratorDevice("failing");
        PushSubscription alsoFailing = administratorDevice("also-failing");
        outcomes.put(gone.endpoint(), PushOutcome.GONE);
        outcomes.put(failing.endpoint(), PushOutcome.FAILED);
        outcomes.put(alsoFailing.endpoint(), PushOutcome.FAILED);

        PushAttempt attempt = sender(administrators, donors).toAdministrators(List.of(delivered, gone, failing, alsoFailing),
                new PushMessage(PushMessageKind.MAIL_OUTAGE, 1));

        assertThat(attempt.report()).isEqualTo(new PushDeliveryReport(1, 2, 1));
        assertThat(attempt.failed()).containsExactly(failing.id(), alsoFailing.id());
    }

    @Test
    @DisplayName("Given no subscriptions, when a message is sent, then nothing is delivered")
    void should_send_nothing_when_sent_given_no_subscriptions() {
        assertThat(sender(administrators, donors).toAdministrators(List.of(), TEST)).isEqualTo(PushAttempt.NONE);
        verify(keys, never()).current();
    }

    @Test
    @DisplayName("Given an administrator's devices and a donor's device, when each is sent a message, then the administrators' are delivered all at once and the donor's paced")
    void should_deliver_administrators_at_once_and_donors_paced_when_sent() {
        PushSender sender = sender(administrators, donors);

        sender.toAdministrators(List.of(administratorDevice("admin")), TEST);
        sender.toDonors(List.of(donorDevice("jana")), DONOR_TEST);

        assertThat(paces).containsExactly(PushPace.AT_ONCE, PushPace.PACED);
    }

    @Test
    @DisplayName("Given a donor's devices delivered, gone and failing, when they are sent a notification, then the donor's rows are marked delivered, removed and failed and the administrators' rows are untouched")
    void should_record_in_the_donor_rows_when_sent_to_donors() {
        DonorPushSubscription delivered = donorDevice("delivered");
        DonorPushSubscription gone = donorDevice("gone");
        DonorPushSubscription failing = donorDevice("failing");
        PushSubscription administrator = administratorDevice("admin");
        outcomes.put(gone.endpoint(), PushOutcome.GONE);
        outcomes.put(failing.endpoint(), PushOutcome.FAILED);

        PushAttempt sent = sender(administrators, donors).toDonors(List.of(delivered, gone, failing), DONOR_TEST);

        assertThat(sent.report()).isEqualTo(new PushDeliveryReport(1, 1, 1));
        assertThat(sent.failed()).containsExactly(failing.id());
        assertThat(donors.all()).extracting(DonorPushSubscription::id).containsExactlyInAnyOrder(delivered.id(), failing.id());
        assertThat(donors.all()).filteredOn(row -> row.id().equals(delivered.id())).singleElement()
                .extracting(DonorPushSubscription::lastDeliveredAt).isEqualTo(Optional.of(NOW));
        assertThat(administrators.findById(administrator.id())).get().satisfies(row -> {
            assertThat(row.lastDeliveredAt()).isEmpty();
            assertThat(row.failuresInARow()).isZero();
        });
    }

    @Test
    @DisplayName("Given a device whose push service keeps failing, when a notification fails the third time in a row, then one warning names the subscription by its id and the count")
    void should_warn_once_when_tested_given_third_failure_in_a_row() {
        DonorPushSubscription phone = donorDevice("jana");
        outcomes.put(phone.endpoint(), PushOutcome.FAILED);
        PushSender sender = sender(administrators, donors);

        for (int attempt = 0; attempt < 4; attempt++) {
            assertThat(sender.toDonors(List.of(phone), DONOR_TEST).report()).isEqualTo(new PushDeliveryReport(0, 1, 0));
        }

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel().toString()).isEqualTo("WARN");
            assertThat(event.getFormattedMessage()).isEqualTo("Push subscription " + phone.id().value() + " failed 3 times in a row");
        });
    }

    @Test
    @DisplayName("Given a notification the push service took, when its outcome cannot be written, then it still counts as delivered")
    void should_report_delivery_when_sent_given_outcome_not_written() {
        DonorPushSubscription phone = donorDevice("jana");
        InMemoryDonorPushSubscriptions unwritable = new InMemoryDonorPushSubscriptions() {
            @Override
            public synchronized void markDelivered(PushSubscriptionId id, Instant at) {
                throw new IllegalStateException("The database is busy");
            }
        };
        donors.all().forEach(unwritable::save);

        assertThat(sender(administrators, unwritable).toDonors(List.of(phone), DONOR_TEST).report()).isEqualTo(new PushDeliveryReport(1, 0, 0));
    }

    @Test
    @DisplayName("Given a device the push service no longer knows, when its removal cannot be written, then one warning names the outcome, the subscription by its id and the failure's class only")
    void should_warn_when_sent_given_gone_outcome_not_written() {
        PushSubscription gone = administratorDevice("gone");
        outcomes.put(gone.endpoint(), PushOutcome.GONE);
        InMemoryPushSubscriptions unwritable = new InMemoryPushSubscriptions() {
            @Override
            public synchronized void delete(PushSubscriptionId id) {
                throw new IllegalStateException("The database is busy");
            }
        };
        administrators.all().forEach(unwritable::save);

        PushDeliveryReport report = sender(unwritable, donors).toAdministrators(List.of(gone), TEST).report();

        assertThat(report).isEqualTo(new PushDeliveryReport(0, 0, 1));
        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel().toString()).isEqualTo("WARN");
            assertThat(event.getFormattedMessage())
                    .isEqualTo("Push outcome GONE of subscription " + gone.id().value() + " could not be recorded: IllegalStateException");
        });
    }

    @Test
    @DisplayName("Given a device whose outcome the delivery could not read because its thread was stopped, when a message is sent, then it counts neither as delivered nor as failed and its row is untouched")
    void should_count_nothing_when_sent_given_outcome_not_read() {
        PushSubscription read = administratorDevice("read");
        PushSubscription notRead = administratorDevice("not-read");
        unread.add(notRead.endpoint());

        PushAttempt sent = sender(administrators, donors).toAdministrators(List.of(read, notRead), TEST);

        assertThat(sent).isEqualTo(new PushAttempt(new PushDeliveryReport(1, 0, 0), List.of()));
        assertThat(administrators.findById(notRead.id())).get().satisfies(row -> {
            assertThat(row.lastDeliveredAt()).isEmpty();
            assertThat(row.failuresInARow()).isZero();
        });
    }

    private PushSender sender(InMemoryPushSubscriptions administratorRows, InMemoryDonorPushSubscriptions donorRows) {
        PushDelivery delivery = (recipients, message, vapid, pace) -> {
            paces.add(pace);
            Map<PushSubscriptionId, PushOutcome> delivered = new LinkedHashMap<>();
            for (PushRecipient recipient : recipients) {
                if (!unread.contains(recipient.endpoint())) {
                    delivered.put(recipient.id(), outcomes.getOrDefault(recipient.endpoint(), PushOutcome.DELIVERED));
                }
            }
            return delivered;
        };
        return new PushSender(delivery, keys, administratorRows, donorRows, new TransactionTemplate(mock(PlatformTransactionManager.class)),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private PushSubscription administratorDevice(String name) {
        PushSubscription subscription = PushSubscription.subscribe(ADMIN, UUID.randomUUID(), new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name),
                CLIENT, PushAlerts.ALL, NOW);
        administrators.save(subscription);
        return subscription;
    }

    private DonorPushSubscription donorDevice(String name) {
        DonorPushSubscription subscription = DonorPushSubscription.subscribe(JANA, UUID.randomUUID(),
                new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT, DonorNotifications.ALL, NOW);
        donors.save(subscription);
        return subscription;
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(PushSender.class);
    }
}
