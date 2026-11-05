package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static cz.novanadeje.app.operations.infrastructure.push.WebPushEncryptionTest.AUTH_SECRET;
import static cz.novanadeje.app.operations.infrastructure.push.WebPushEncryptionTest.RECEIVER_PRIVATE;
import static cz.novanadeje.app.operations.infrastructure.push.WebPushEncryptionTest.RECEIVER_PUBLIC;
import static cz.novanadeje.app.operations.infrastructure.push.WebPushEncryptionTest.decode;
import static org.assertj.core.api.Assertions.assertThat;

class WebPushDeliveryTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final PushSubscription SUBSCRIPTION = PushSubscription.subscribe(UUID.randomUUID(), UUID.randomUUID(),
            new PushEndpoint("https://web.push.apple.com/QGuQyavXutnMH7Vi"), new PushClientKeys(RECEIVER_PUBLIC, AUTH_SECRET), PushAlerts.ALL, NOW);

    private final VapidKeys keys = new JcaPushKeyGenerator().generate();
    private final AtomicReference<Sent> sent = new AtomicReference<>();
    private final AtomicReference<Integer> status = new AtomicReference<>(201);
    private final WebPushDelivery delivery = new WebPushDelivery((endpoint, headers, body) -> {
        sent.set(new Sent(endpoint, headers, body));
        return status.get();
    }, new PublicUrlProperties("https://nfnn.cz"), Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given a subscription, when a test alert is delivered, then the push service gets an aes128gcm body for a day with high urgency and a VAPID authorization, and no topic that would name the kind")
    void should_post_encrypted_body_with_headers_when_delivered_given_a_subscription() {
        PushOutcome outcome = delivery.deliver(SUBSCRIPTION, new PushMessage(PushMessageKind.TEST, 0), keys);

        assertThat(outcome).isEqualTo(PushOutcome.DELIVERED);
        assertThat(sent.get().endpoint()).isEqualTo(URI.create("https://web.push.apple.com/QGuQyavXutnMH7Vi"));
        assertThat(sent.get().headers()).containsEntry("Content-Encoding", "aes128gcm").containsEntry("TTL", "86400")
                .containsEntry("Urgency", "high").containsEntry("Content-Type", "application/octet-stream").doesNotContainKey("Topic");
        assertThat(sent.get().headers().get("Authorization")).startsWith("vapid t=").endsWith(", k=" + keys.publicKey());
    }

    @Test
    @DisplayName("Given a test alert, when the browser decrypts what the push service got, then it reads exactly the version, the kind and the count, and nothing else")
    void should_carry_only_version_kind_and_count_when_decrypted_given_a_test_alert() {
        delivery.deliver(SUBSCRIPTION, new PushMessage(PushMessageKind.TEST, 0), keys);

        byte[] plaintext = WebPushDecryption.decrypt(sent.get().body(), decode(RECEIVER_PRIVATE), decode(RECEIVER_PUBLIC), decode(AUTH_SECRET));

        assertThat(new String(plaintext, StandardCharsets.UTF_8)).isEqualTo("{\"v\":1,\"kind\":\"test\",\"count\":0}");
    }

    @Test
    @DisplayName("Given two alerts of different lengths, when they are delivered, then their bodies have the same length, so the push service cannot tell them apart by size")
    void should_send_bodies_of_one_length_when_delivered_given_messages_of_different_lengths() {
        delivery.deliver(SUBSCRIPTION, new PushMessage(PushMessageKind.TEST, 0), keys);
        int shortBody = sent.get().body().length;
        delivery.deliver(SUBSCRIPTION, new PushMessage(PushMessageKind.TEST, 999), keys);

        assertThat(sent.get().body()).hasSize(shortBody);
        assertThat(new String(WebPushDecryption.decrypt(sent.get().body(), decode(RECEIVER_PRIVATE), decode(RECEIVER_PUBLIC), decode(AUTH_SECRET)),
                StandardCharsets.UTF_8)).isEqualTo("{\"v\":1,\"kind\":\"test\",\"count\":999}");
    }

    @ParameterizedTest(name = "{0} gives {1}")
    @CsvSource({"200, DELIVERED", "201, DELIVERED", "202, DELIVERED", "404, GONE", "410, GONE", "0, FAILED", "400, FAILED", "403, FAILED",
            "413, FAILED", "429, FAILED", "500, FAILED", "503, FAILED", "302, FAILED"})
    @DisplayName("Given an answer of the push service, when a message is delivered, then its outcome follows RFC 8030")
    void should_map_status_when_delivered_given_the_answer(int answer, PushOutcome expected) {
        status.set(answer);

        assertThat(delivery.deliver(SUBSCRIPTION, new PushMessage(PushMessageKind.TEST, 0), keys)).isEqualTo(expected);
    }

    private record Sent(URI endpoint, Map<String, String> headers, byte[] body) {
    }
}
