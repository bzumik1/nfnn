package cz.novanadeje.app.operations.application.push;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.settings.CarriedSettingsKeyService;
import cz.novanadeje.app.operations.application.settings.ReversibleSealer;
import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushKey;
import cz.novanadeje.app.operations.domain.push.PushKeyRepository;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushUnavailable;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

class PushKeyServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final VapidKeys FIRST = new VapidKeys("B" + "a".repeat(86), "0123456789abcdefghijABCDEFGHIJklmnopqrstuvw");
    private static final VapidKeys SECOND = new VapidKeys("B" + "b".repeat(86), "s".repeat(43));

    private final InMemoryPushKeys stored = new InMemoryPushKeys();
    private final InMemoryPushSubscriptions subscriptions = new InMemoryPushSubscriptions();
    private final InMemoryDonorPushSubscriptions donorSubscriptions = new InMemoryDonorPushSubscriptions();
    private final ReversibleSealer sealer = new ReversibleSealer();
    private final Deque<VapidKeys> generated = new ArrayDeque<>(List.of(FIRST, SECOND));
    private final CarriedSettingsKeyService carriedKeys = mock(CarriedSettingsKeyService.class);
    private final PushKeyService service = new PushKeyService(stored, subscriptions, donorSubscriptions, sealer, generated::removeFirst, carriedKeys,
            Clock.fixed(NOW, ZoneOffset.UTC));
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
    @DisplayName("Given no push keys yet, when they are asked for twice, then one pair is generated, its private key stored only sealed, and nothing logged")
    void should_generate_once_and_seal_when_asked_given_no_keys() {
        VapidKeys first = service.current();
        VapidKeys again = service.current();

        assertThat(first).isEqualTo(FIRST).isEqualTo(again);
        assertThat(generated).containsExactly(SECOND);
        assertThat(stored.find()).get().satisfies(key -> {
            assertThat(key.publicKey()).isEqualTo(FIRST.publicKey());
            assertThat(key.sealedPrivateKey()).isNotEqualTo(FIRST.privateKey()).doesNotContain(FIRST.privateKey());
            assertThat(key.createdAt()).isEqualTo(NOW);
        });
        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given push keys sealed by another settings key, when they are asked for, then new keys replace them, every administrator's and donor's subscription is removed and one warning without a key is logged")
    void should_replace_keys_and_remove_subscriptions_when_asked_given_unreadable_keys() {
        stored.replace(new PushKey(SECOND.publicKey(), new ReversibleSealer("other:").seal(PushKey.SEAL_PURPOSE, SECOND.privateKey()), NOW));
        subscriptions.save(PushSubscription.subscribe(UUID.randomUUID(), UUID.randomUUID(), new PushEndpoint("https://fcm.googleapis.com/fcm/send/a"),
                new PushClientKeys("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg"),
                PushAlerts.ALL, NOW));
        donorSubscriptions.save(DonorPushSubscription.subscribe(UUID.randomUUID(), UUID.randomUUID(), new PushEndpoint("https://fcm.googleapis.com/fcm/send/b"),
                new PushClientKeys("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg"),
                DonorNotifications.ALL, NOW));

        assertThat(service.current()).isEqualTo(FIRST);

        assertThat(subscriptions.all()).isEmpty();
        assertThat(donorSubscriptions.all()).isEmpty();
        assertThat(stored.find()).map(PushKey::publicKey).contains(FIRST.publicKey());
        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel().toString()).isEqualTo("WARN");
            assertThat(event.getFormattedMessage()).contains("2 push subscriptions removed").doesNotContain(FIRST.privateKey()).doesNotContain(SECOND.privateKey());
        });
    }

    @Test
    @DisplayName("Given push keys sealed by the settings key a restored backup carried, when they are asked for before the startup sealed them again, then the carried key seals them again and nothing is replaced or removed")
    void should_seal_again_with_carried_key_when_asked_given_keys_of_restored_backup() {
        stored.replace(new PushKey(SECOND.publicKey(), new ReversibleSealer("other:").seal(PushKey.SEAL_PURPOSE, SECOND.privateKey()), NOW));
        subscriptions.save(PushSubscription.subscribe(UUID.randomUUID(), UUID.randomUUID(), new PushEndpoint("https://fcm.googleapis.com/fcm/send/a"),
                new PushClientKeys("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg"),
                PushAlerts.ALL, NOW));
        doAnswer(invocation -> {
            stored.replace(new PushKey(SECOND.publicKey(), sealer.seal(PushKey.SEAL_PURPOSE, SECOND.privateKey()), NOW));
            return null;
        }).when(carriedKeys).sealPushKeyAgain();

        assertThat(service.current()).isEqualTo(SECOND);

        assertThat(subscriptions.all()).hasSize(1);
        assertThat(generated).hasSize(2);
        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given no settings key, when push keys are asked for, then push is unavailable and nothing is generated")
    void should_refuse_when_asked_given_no_settings_key() {
        sealer.withoutKey();

        assertThatThrownBy(service::current).isInstanceOf(PushUnavailable.class);
        assertThat(generated).hasSize(2);
        assertThat(stored.find()).isEmpty();
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(PushKeyService.class);
    }

    private static final class InMemoryPushKeys implements PushKeyRepository {

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
