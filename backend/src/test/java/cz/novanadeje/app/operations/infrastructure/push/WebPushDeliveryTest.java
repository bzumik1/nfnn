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
import org.springframework.context.MessageSource;
import org.springframework.context.support.ResourceBundleMessageSource;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
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
    }, new PushPayloads(messages()), new PublicUrlProperties("https://nfnn.cz"), Clock.fixed(NOW, ZoneOffset.UTC));

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
    @DisplayName("Given a test alert, when the browser decrypts what the push service got, then it reads the version, the kind, the count and the fixed Czech notification of that kind, which opens its fixed route")
    void should_carry_version_kind_count_and_fixed_notification_when_decrypted_given_a_test_alert() {
        delivery.deliver(SUBSCRIPTION, new PushMessage(PushMessageKind.TEST, 0), keys);

        assertThat(decrypted()).isEqualTo("{\"v\":1,\"kind\":\"test\",\"count\":0,\"notification\":{\"title\":\"Zkušební upozornění\","
                + "\"body\":\"Upozornění ze Správy Nové naděje na tomto zařízení fungují.\",\"tag\":\"nfnn-test\",\"renotify\":true,\"lang\":\"cs\","
                + "\"icon\":\"/icon-192.png\",\"data\":{\"kind\":\"test\",\"count\":0,\"onActionClick\":{\"default\":"
                + "{\"operation\":\"focusLastFocusedOrOpen\",\"url\":\"/sprava/upozorneni\"}}}}}");
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({
            "BANK_IMPORT_OUTAGE, bank-import-outage, Import z banky nefunguje, nfnn-bank-import, /sprava",
            "BANK_IMPORT_RECOVERED, bank-import-recovered, Import z banky zase funguje, nfnn-bank-import, /sprava",
            "BACKUPS_OUTAGE, backups-outage, Zálohy mají problém, nfnn-backups, /sprava/zalohy",
            "BACKUPS_RECOVERED, backups-recovered, Zálohy jsou zase v pořádku, nfnn-backups, /sprava/zalohy",
            "MAIL_OUTAGE, mail-outage, E-maily neodcházejí, nfnn-mail, /sprava/nastaveni",
            "MAIL_RECOVERED, mail-recovered, E-maily zase odcházejí, nfnn-mail, /sprava/nastaveni"})
    @DisplayName("Given an alert of an area, when it is delivered, then the notification names what happened, replaces the last one of its area and opens the area's page")
    void should_name_the_area_and_its_route_when_delivered_given_an_alert(PushMessageKind kind, String token, String title, String tag, String route) {
        delivery.deliver(SUBSCRIPTION, new PushMessage(kind, 2), keys);

        assertThat(decrypted()).startsWith("{\"v\":1,\"kind\":\"" + token + "\",\"count\":2,\"notification\":{\"title\":\"" + title + "\"")
                .contains("\"tag\":\"" + tag + "\",\"renotify\":true")
                .endsWith("\"data\":{\"kind\":\"" + token + "\",\"count\":2,\"onActionClick\":{\"default\":{\"operation\":\"focusLastFocusedOrOpen\",\"url\":\""
                        + route + "\"}}}}}");
    }

    @Test
    @DisplayName("Given every kind of alert with the largest count, when they are delivered, then their bodies have the same length, so the push service cannot tell them apart by size")
    void should_send_bodies_of_one_length_when_delivered_given_every_kind() {
        Set<Integer> lengths = new HashSet<>();
        for (PushMessageKind kind : PushMessageKind.values()) {
            for (int count : new int[]{0, PushMessage.MAX_COUNT}) {
                delivery.deliver(SUBSCRIPTION, new PushMessage(kind, count), keys);
                lengths.add(sent.get().body().length);
                assertThat(decrypted()).contains("\"kind\":\"" + kind.token() + "\",\"count\":" + count + ",");
            }
        }

        assertThat(lengths).singleElement();
    }

    @ParameterizedTest(name = "{0} gives {1}")
    @CsvSource({"200, DELIVERED", "201, DELIVERED", "202, DELIVERED", "404, GONE", "410, GONE", "0, FAILED", "400, FAILED", "403, FAILED",
            "413, FAILED", "429, FAILED", "500, FAILED", "503, FAILED", "302, FAILED"})
    @DisplayName("Given an answer of the push service, when a message is delivered, then its outcome follows RFC 8030")
    void should_map_status_when_delivered_given_the_answer(int answer, PushOutcome expected) {
        status.set(answer);

        assertThat(delivery.deliver(SUBSCRIPTION, new PushMessage(PushMessageKind.TEST, 0), keys)).isEqualTo(expected);
    }

    private String decrypted() {
        return new String(WebPushDecryption.decrypt(sent.get().body(), decode(RECEIVER_PRIVATE), decode(RECEIVER_PUBLIC), decode(AUTH_SECRET)),
                StandardCharsets.UTF_8);
    }

    private static MessageSource messages() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        return messages;
    }

    private record Sent(URI endpoint, Map<String, String> headers, byte[] body) {
    }
}
