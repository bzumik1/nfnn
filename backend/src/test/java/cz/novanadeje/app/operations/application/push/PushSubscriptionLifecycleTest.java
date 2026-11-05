package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.shared.application.event.AdministrationRevoked;
import cz.novanadeje.app.shared.application.event.DonorErased;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class PushSubscriptionLifecycleTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID JANA = UUID.randomUUID();
    private static final UUID PETR = UUID.randomUUID();

    private final InMemoryPushSubscriptions subscriptions = new InMemoryPushSubscriptions();
    private final PushSubscriptionLifecycle lifecycle = new PushSubscriptionLifecycle(subscriptions);

    @Test
    @DisplayName("Given devices of two administrators, when one loses the role, then only that one's devices go")
    void should_remove_devices_of_former_administrator_when_role_revoked_given_two_administrators() {
        subscribed(JANA, "jana");
        PushSubscription petr = subscribed(PETR, "petr");

        lifecycle.on(new AdministrationRevoked(JANA, NOW));

        assertThat(subscriptions.all()).containsExactly(petr);
    }

    @Test
    @DisplayName("Given a device left by a token issued before the role was taken away, when its donor is erased, then the device goes with the erasure")
    void should_remove_devices_when_erased_given_device_left_by_older_token() {
        subscribed(JANA, "jana");
        PushSubscription petr = subscribed(PETR, "petr");

        lifecycle.on(new DonorErased(JANA, NOW));

        assertThat(subscriptions.all()).containsExactly(petr);
    }

    private PushSubscription subscribed(UUID administrator, String name) {
        PushSubscription subscription = PushSubscription.subscribe(administrator, UUID.randomUUID(),
                new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT, PushAlerts.ALL, NOW);
        subscriptions.save(subscription);
        return subscription;
    }
}
