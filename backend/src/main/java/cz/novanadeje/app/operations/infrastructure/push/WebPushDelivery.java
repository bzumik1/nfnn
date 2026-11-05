package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.application.push.PushDelivery;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;

@Component
class WebPushDelivery implements PushDelivery {

    static final Duration TIME_TO_LIVE = Duration.ofDays(1);
    static final int PADDED_MESSAGE_BYTES = 128;

    private final PushTransport transport;
    private final WebPushEncryption encryption;
    private final PublicUrlProperties site;
    private final Clock clock;

    @Autowired
    WebPushDelivery(PushTransport transport, PublicUrlProperties site, Clock clock) {
        this(transport, WebPushEncryption.random(), site, clock);
    }

    WebPushDelivery(PushTransport transport, WebPushEncryption encryption, PublicUrlProperties site, Clock clock) {
        this.transport = transport;
        this.encryption = encryption;
        this.site = site;
        this.clock = clock;
    }

    @Override
    public PushOutcome deliver(PushSubscription subscription, PushMessage message, VapidKeys keys) {
        byte[] body = encryption.encrypt(subscription.keys().p256dhBytes(), subscription.keys().authBytes(),
                message.json().getBytes(StandardCharsets.UTF_8), PADDED_MESSAGE_BYTES);
        Map<String, String> headers = Map.of(
                "Authorization", VapidToken.authorization(keys, subscription.endpoint(), site.publicUrl(), clock.instant()),
                "Content-Encoding", "aes128gcm",
                "Content-Type", "application/octet-stream",
                "TTL", Long.toString(TIME_TO_LIVE.toSeconds()),
                "Urgency", "high");
        int status = transport.post(subscription.endpoint().uri(), headers, body);
        if (status >= 200 && status < 300) {
            return PushOutcome.DELIVERED;
        }
        if (status == 404 || status == 410) {
            return PushOutcome.GONE;
        }
        return PushOutcome.FAILED;
    }
}
