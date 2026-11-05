package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(OperationsPersistenceTestConfiguration.class)
class JpaPushSubscriptionRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID JANA = UUID.fromString("019a0000-0000-7000-8000-00000000000a");
    private static final UUID PETR = UUID.fromString("019a0000-0000-7000-8000-00000000000b");

    @Autowired
    private PushSubscriptionRepository subscriptions;

    @Test
    @DisplayName("Given devices stored at one instant and later, when an administrator's devices are read, then they come oldest first and by id within an instant, with nothing of another administrator")
    void should_order_by_time_then_id_when_read_given_devices_of_two_administrators() {
        PushSubscription later = stored(JANA, "later", NOW.plusSeconds(1));
        PushSubscription first = stored(JANA, "first", NOW);
        PushSubscription second = stored(JANA, "second", NOW);
        stored(PETR, "petr", NOW);

        assertThat(subscriptions.findAllOf(JANA)).extracting(PushSubscription::endpoint)
                .containsExactly(first.id().value().compareTo(second.id().value()) < 0 ? first.endpoint() : second.endpoint(),
                        first.id().value().compareTo(second.id().value()) < 0 ? second.endpoint() : first.endpoint(), later.endpoint());
    }

    @Test
    @DisplayName("Given a stored device, when it is read back, then every field round-trips")
    void should_round_trip_when_read_given_a_stored_device() {
        PushSubscription device = stored(JANA, "telefon", NOW);

        assertThat(subscriptions.findById(device.id())).contains(device);
    }

    @Test
    @DisplayName("Given a device, when it fails twice and is then delivered, then the failures count up and the delivery resets them")
    void should_count_failures_and_reset_when_delivered_given_a_device() {
        PushSubscription device = stored(JANA, "telefon", NOW);

        assertThat(subscriptions.markFailed(device.id())).contains(1);
        assertThat(subscriptions.markFailed(device.id())).contains(2);
        subscriptions.markDelivered(device.id(), NOW.plusSeconds(60));

        assertThat(subscriptions.findById(device.id())).get().satisfies(row -> {
            assertThat(row.failuresInARow()).isZero();
            assertThat(row.lastDeliveredAt()).contains(NOW.plusSeconds(60));
        });
    }

    @Test
    @DisplayName("Given a device removed meanwhile, when its delivery, failure or alert change is recorded, then nothing is written and it stays removed")
    void should_touch_nothing_when_recorded_given_device_removed() {
        PushSubscription device = stored(JANA, "telefon", NOW);
        subscriptions.delete(device.id());

        subscriptions.markDelivered(device.id(), NOW);

        assertThat(subscriptions.markFailed(device.id())).isEmpty();
        assertThat(subscriptions.changeAlerts(device.id(), JANA, new PushAlerts(false, false, false))).isFalse();
        assertThat(subscriptions.findById(device.id())).isEmpty();
    }

    @Test
    @DisplayName("Given a device with failures, when its alerts change, then only the switches change and the change of another administrator touches nothing")
    void should_change_only_switches_when_changed_given_a_device_with_failures() {
        PushSubscription device = stored(JANA, "telefon", NOW);
        subscriptions.markFailed(device.id());

        assertThat(subscriptions.changeAlerts(device.id(), PETR, new PushAlerts(false, false, false))).isFalse();
        assertThat(subscriptions.changeAlerts(device.id(), JANA, new PushAlerts(true, false, true))).isTrue();

        assertThat(subscriptions.findById(device.id())).get().satisfies(row -> {
            assertThat(row.alerts()).isEqualTo(new PushAlerts(true, false, true));
            assertThat(row.failuresInARow()).isEqualTo(1);
        });
    }

    @Test
    @DisplayName("Given devices of two administrators, when one is looked up and deleted by endpoint or by device, then exactly those with either go")
    void should_find_and_delete_by_endpoint_or_device_when_asked_given_devices() {
        PushSubscription sameEndpoint = stored(PETR, "spolecny", NOW);
        PushSubscription sameDevice = stored(JANA, "telefon", NOW);
        PushSubscription other = stored(JANA, "notebook", NOW);

        assertThat(subscriptions.findByEndpointOrDevice(sameEndpoint.endpoint(), sameDevice.deviceId()))
                .containsExactlyInAnyOrder(sameEndpoint, sameDevice);
        subscriptions.deleteByEndpointOrDevice(sameEndpoint.endpoint(), sameDevice.deviceId());

        assertThat(subscriptions.findAllOf(JANA)).containsExactly(other);
        assertThat(subscriptions.findAllOf(PETR)).isEmpty();
    }

    @Test
    @DisplayName("Given devices of two administrators, when those of one device, of one administrator and then all are deleted, then each answers how many went")
    void should_count_deleted_when_deleted_given_devices() {
        PushSubscription telefon = stored(JANA, "telefon", NOW);
        stored(JANA, "notebook", NOW);
        stored(PETR, "petr", NOW);

        assertThat(subscriptions.deleteAllOfDevice(telefon.deviceId())).isEqualTo(1);
        assertThat(subscriptions.deleteAllOf(JANA)).isEqualTo(1);
        assertThat(subscriptions.deleteAll()).isEqualTo(1);
        assertThat(subscriptions.findAllOf(PETR)).isEmpty();
    }

    @Test
    @DisplayName("Given a transaction, when the writes are locked, then the lock is taken without an error")
    void should_take_lock_when_locked_given_a_transaction() {
        subscriptions.lockWrites();

        assertThat(subscriptions.findAllOf(JANA)).isEmpty();
    }

    private PushSubscription stored(UUID administrator, String name, Instant at) {
        PushSubscription subscription = PushSubscription.subscribe(administrator, UUID.nameUUIDFromBytes(name.getBytes()),
                new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + name), CLIENT, PushAlerts.ALL, at);
        subscriptions.save(subscription);
        return subscription;
    }
}
