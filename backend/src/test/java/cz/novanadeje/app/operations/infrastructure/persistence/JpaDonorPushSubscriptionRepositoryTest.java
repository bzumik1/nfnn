package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class JpaDonorPushSubscriptionRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-12T10:00:00Z");
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID JANA = UUID.fromString("019a0000-0000-7000-8000-00000000000a");
    private static final UUID PETR = UUID.fromString("019a0000-0000-7000-8000-00000000000b");

    @Autowired
    private DonorPushSubscriptionRepository subscriptions;

    @Test
    @DisplayName("Given devices stored at one instant and later, when a donor's devices are read, then they come oldest first and by id within an instant, with nothing of another donor")
    void should_order_by_time_then_id_when_read_given_devices_of_two_donors() {
        DonorPushSubscription later = stored(JANA, "later", NOW.plusSeconds(1));
        DonorPushSubscription first = stored(JANA, "first", NOW);
        DonorPushSubscription second = stored(JANA, "second", NOW);
        stored(PETR, "petr", NOW);

        boolean firstIdComesFirst = first.id().value().compareTo(second.id().value()) < 0;
        assertThat(subscriptions.findAllOf(JANA)).extracting(DonorPushSubscription::endpoint)
                .containsExactly(firstIdComesFirst ? first.endpoint() : second.endpoint(), firstIdComesFirst ? second.endpoint() : first.endpoint(),
                        later.endpoint());
    }

    @Test
    @DisplayName("Given a stored device, when it is read back by its donor and device, then every field round-trips and another donor finds nothing")
    void should_round_trip_when_read_by_device_given_a_stored_device() {
        DonorPushSubscription device = stored(JANA, "telefon", NOW);

        assertThat(subscriptions.findOfDevice(JANA, device.deviceId())).contains(device);
        assertThat(subscriptions.findOfDevice(PETR, device.deviceId())).isEmpty();
    }

    @Test
    @DisplayName("Given a device with failures, when its notifications change, then only the switches change and the change of another donor touches nothing")
    void should_change_only_switches_when_changed_given_a_device_with_failures() {
        DonorPushSubscription device = stored(JANA, "telefon", NOW);
        assertThat(subscriptions.markFailed(device.id())).contains(1);

        assertThat(subscriptions.changeNotifications(PETR, device.deviceId(), new DonorNotifications(false, false))).isFalse();
        assertThat(subscriptions.changeNotifications(JANA, device.deviceId(), new DonorNotifications(false, true))).isTrue();

        assertThat(subscriptions.findOfDevice(JANA, device.deviceId())).get().satisfies(row -> {
            assertThat(row.notifications()).isEqualTo(new DonorNotifications(false, true));
            assertThat(row.failuresInARow()).isEqualTo(1);
        });
    }

    @Test
    @DisplayName("Given a device, when it fails twice and is then delivered, then the failures count up and the delivery resets them; once removed, nothing is written")
    void should_count_failures_and_reset_when_delivered_given_a_device() {
        DonorPushSubscription device = stored(JANA, "telefon", NOW);

        assertThat(subscriptions.markFailed(device.id())).contains(1);
        assertThat(subscriptions.markFailed(device.id())).contains(2);
        subscriptions.markDelivered(device.id(), NOW.plusSeconds(60));

        assertThat(subscriptions.findOfDevice(JANA, device.deviceId())).get().satisfies(row -> {
            assertThat(row.failuresInARow()).isZero();
            assertThat(row.lastDeliveredAt()).contains(NOW.plusSeconds(60));
        });
        subscriptions.delete(device.id());
        assertThat(subscriptions.markFailed(device.id())).isEmpty();
        assertThat(subscriptions.findOfDevice(JANA, device.deviceId())).isEmpty();
    }

    @Test
    @DisplayName("Given devices of two donors, when those with an endpoint or a device are deleted, then exactly those with either go")
    void should_delete_by_endpoint_or_device_when_asked_given_devices() {
        DonorPushSubscription sameEndpoint = stored(PETR, "spolecny", NOW);
        DonorPushSubscription sameDevice = stored(JANA, "telefon", NOW);
        DonorPushSubscription other = stored(JANA, "notebook", NOW);

        subscriptions.deleteByEndpointOrDevice(sameEndpoint.endpoint(), sameDevice.deviceId());

        assertThat(subscriptions.findAllOf(JANA)).containsExactly(other);
        assertThat(subscriptions.findAllOf(PETR)).isEmpty();
    }

    @Test
    @DisplayName("Given devices of two donors, when those of one device, of one donor and then all are deleted, then each answers how many went")
    void should_count_deleted_when_deleted_given_devices() {
        DonorPushSubscription telefon = stored(JANA, "telefon", NOW);
        stored(JANA, "notebook", NOW);
        stored(PETR, "petr", NOW);

        assertThat(subscriptions.deleteAllOfDevice(telefon.deviceId())).isEqualTo(1);
        assertThat(subscriptions.deleteAllOf(JANA)).isEqualTo(1);
        assertThat(subscriptions.deleteAll()).isEqualTo(1);
        assertThat(subscriptions.findAllOf(PETR)).isEmpty();
    }

    @Test
    @DisplayName("Given devices of three donors with the gift switch on and off, when the devices that want gifts of two donors are read, then only those of the two with the switch on come")
    void should_read_only_wanting_devices_of_named_donors_when_read_given_switches() {
        DonorPushSubscription janaTelefon = stored(JANA, "jana-telefon", NOW);
        DonorPushSubscription janaNotebook = stored(JANA, "jana-notebook", NOW);
        subscriptions.changeNotifications(JANA, janaNotebook.deviceId(), new DonorNotifications(false, true));
        DonorPushSubscription petrTelefon = stored(PETR, "petr-telefon", NOW);
        stored(UUID.fromString("019a0000-0000-7000-8000-00000000000c"), "eva-telefon", NOW);

        assertThat(subscriptions.findWithGiftNotificationsOf(List.of(JANA, PETR))).extracting(DonorPushSubscription::id)
                .containsExactlyInAnyOrder(janaTelefon.id(), petrTelefon.id());
        assertThat(subscriptions.findWithGiftNotificationsOf(List.of())).isEmpty();
    }

    @Test
    @DisplayName("Given more donors than one query takes, when their devices that want gifts are read, then the devices of the first and the last donor both come")
    void should_read_across_queries_when_read_given_more_donors_than_one_query_takes() {
        List<UUID> donors = new ArrayList<>();
        for (int index = 0; index <= JpaDonorPushSubscriptionRepository.DONORS_PER_QUERY; index++) {
            donors.add(UUID.nameUUIDFromBytes(("darce-" + index).getBytes()));
        }
        DonorPushSubscription first = stored(donors.getFirst(), "prvni", NOW);
        DonorPushSubscription last = stored(donors.getLast(), "posledni", NOW);

        assertThat(subscriptions.findWithGiftNotificationsOf(donors)).extracting(DonorPushSubscription::id)
                .containsExactlyInAnyOrder(first.id(), last.id());
    }

    @Test
    @DisplayName("Given a transaction, when the writes are locked, then the lock is taken without an error")
    void should_take_lock_when_locked_given_a_transaction() {
        subscriptions.lockWrites();

        assertThat(subscriptions.findAllOf(JANA)).isEmpty();
    }

    private DonorPushSubscription stored(UUID donor, String name, Instant at) {
        DonorPushSubscription subscription = DonorPushSubscription.subscribe(donor, UUID.nameUUIDFromBytes(name.getBytes()),
                new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT, DonorNotifications.ALL, at);
        subscriptions.save(subscription);
        return subscription;
    }
}
