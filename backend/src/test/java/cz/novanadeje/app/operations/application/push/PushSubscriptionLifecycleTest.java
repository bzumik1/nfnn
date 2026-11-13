package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.shared.application.event.AdministrationRevoked;
import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
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
    private final InMemoryDonorPushSubscriptions donorSubscriptions = new InMemoryDonorPushSubscriptions();
    private final PushSubscriptionLifecycle lifecycle = new PushSubscriptionLifecycle(subscriptions, donorSubscriptions);

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

    @Test
    @DisplayName("Given two devices of one administrator, when one device signs out, then only that device's subscription goes")
    void should_remove_subscription_of_device_when_device_signed_out_given_two_devices_of_one_administrator() {
        UUID telefon = UUID.randomUUID();
        subscribed(JANA, telefon, "jana-telefon");
        PushSubscription pocitac = subscribed(JANA, UUID.randomUUID(), "jana-pocitac");

        lifecycle.on(new DeviceSignedOut(JANA, telefon, NOW));

        assertThat(subscriptions.all()).containsExactly(pocitac);
    }

    @Test
    @DisplayName("Given an administrator's notifications as a donor, when the administrator loses the role, then the donor's notifications stay")
    void should_keep_donor_notifications_when_role_revoked_given_administrator_who_donates() {
        DonorPushSubscription jana = subscribedAsDonor(JANA, UUID.randomUUID(), "jana-darce");

        lifecycle.on(new AdministrationRevoked(JANA, NOW));

        assertThat(donorSubscriptions.all()).containsExactly(jana);
    }

    @Test
    @DisplayName("Given the notifications of two donors, when one is erased, then only that donor's notifications go")
    void should_remove_donor_notifications_when_erased_given_two_donors() {
        subscribedAsDonor(JANA, UUID.randomUUID(), "jana-telefon");
        subscribedAsDonor(JANA, UUID.randomUUID(), "jana-pocitac");
        DonorPushSubscription petr = subscribedAsDonor(PETR, UUID.randomUUID(), "petr");

        lifecycle.on(new DonorErased(JANA, NOW));

        assertThat(donorSubscriptions.all()).containsExactly(petr);
    }

    @Test
    @DisplayName("Given a device with the alerts and the notifications and another device, when the device signs out, then both of its subscriptions go and the other device keeps its own")
    void should_remove_both_subscriptions_of_device_when_device_signed_out_given_administrator_who_donates() {
        UUID telefon = UUID.randomUUID();
        subscribed(JANA, telefon, "jana-telefon");
        subscribedAsDonor(JANA, telefon, "jana-telefon");
        DonorPushSubscription pocitac = subscribedAsDonor(JANA, UUID.randomUUID(), "jana-pocitac");

        lifecycle.on(new DeviceSignedOut(JANA, telefon, NOW));

        assertThat(subscriptions.all()).isEmpty();
        assertThat(donorSubscriptions.all()).containsExactly(pocitac);
    }

    private DonorPushSubscription subscribedAsDonor(UUID donor, UUID device, String name) {
        DonorPushSubscription subscription = DonorPushSubscription.subscribe(donor, device,
                new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT, DonorNotifications.ALL, NOW);
        donorSubscriptions.save(subscription);
        return subscription;
    }

    private PushSubscription subscribed(UUID administrator, String name) {
        return subscribed(administrator, UUID.randomUUID(), name);
    }

    private PushSubscription subscribed(UUID administrator, UUID device, String name) {
        PushSubscription subscription = PushSubscription.subscribe(administrator, device,
                new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT, PushAlerts.ALL, NOW);
        subscriptions.save(subscription);
        return subscription;
    }
}
