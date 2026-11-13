package cz.novanadeje.app.operations.application.push;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
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
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DonorPushServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-12T10:00:00Z");
    private static final VapidKeys KEYS = new VapidKeys("B" + "a".repeat(86), "f".repeat(43));
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID JANA = UUID.randomUUID();
    private static final UUID PHONE = UUID.randomUUID();

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
    @DisplayName("Given a device whose push service keeps failing, when the test notification fails the third time in a row, then one warning names the subscription by its id and the count")
    void should_warn_once_when_tested_given_third_failure_in_a_row() {
        DonorPushSubscription phone = subscribed();
        DonorPushService service = service(subscriptions);

        for (int attempt = 0; attempt < 4; attempt++) {
            assertThat(service.sendTest(JANA, PHONE)).isEqualTo(new PushDeliveryReport(0, 1, 0));
        }

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel().toString()).isEqualTo("WARN");
            assertThat(event.getFormattedMessage()).isEqualTo("Push subscription " + phone.id().value() + " failed 3 times in a row");
        });
    }

    @Test
    @DisplayName("Given a test notification the push service took, when its outcome cannot be written, then the donor still learns it was delivered")
    void should_report_delivery_when_tested_given_outcome_not_written() {
        subscribed();
        answer.set(PushOutcome.DELIVERED);
        InMemoryDonorPushSubscriptions unwritable = new InMemoryDonorPushSubscriptions() {
            @Override
            public synchronized void markDelivered(PushSubscriptionId id, Instant at) {
                throw new IllegalStateException("The database is busy");
            }
        };
        subscriptions.all().forEach(unwritable::save);

        assertThat(service(unwritable).sendTest(JANA, PHONE)).isEqualTo(new PushDeliveryReport(1, 0, 0));
    }

    private DonorPushService service(InMemoryDonorPushSubscriptions stored) {
        return new DonorPushService(stored, keys, (recipient, message, vapid) -> answer.get(), mock(SignedInDevices.class),
                new TransactionTemplate(mock(PlatformTransactionManager.class)), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private DonorPushSubscription subscribed() {
        DonorPushSubscription subscription = DonorPushSubscription.subscribe(JANA, PHONE, new PushEndpoint("https://fcm.googleapis.com/fcm/send/jana"),
                CLIENT, DonorNotifications.ALL, NOW);
        subscriptions.save(subscription);
        return subscription;
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(DonorPushService.class);
    }
}
