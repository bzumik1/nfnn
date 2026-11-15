package cz.novanadeje.app.operations.domain.push;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushSubscriptionTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID PETR = UUID.randomUUID();
    private static final UUID JANA = UUID.randomUUID();
    private static final UUID PHONE = UUID.randomUUID();
    private static final PushEndpoint PHONE_ENDPOINT = new PushEndpoint("https://fcm.googleapis.com/fcm/send/petr-phone");

    @Test
    @DisplayName("Given an administrator with nine devices that get alerts, when another device subscribes, then there is room for it")
    void should_leave_room_when_another_device_subscribes_given_nine_devices() {
        assertThatCode(() -> phone().requireRoomAmong(devicesOf(PETR, 9))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given an administrator with ten devices that get alerts, when another device subscribes, then it is refused as over the limit")
    void should_refuse_as_over_the_limit_when_another_device_subscribes_given_ten_devices() {
        assertThatThrownBy(() -> phone().requireRoomAmong(devicesOf(PETR, 10)))
                .isInstanceOf(PushSubscriptionLimitReached.class)
                .hasFieldOrPropertyWithValue("code", "operations/push-subscription-limit");
    }

    @Test
    @DisplayName("Given an administrator with ten devices that get alerts, one of them this device, when this device subscribes again, then there is room for it")
    void should_leave_room_when_the_device_subscribes_again_given_ten_devices_with_its_earlier_subscription() {
        List<PushSubscription> others = new ArrayList<>(devicesOf(PETR, 9));
        others.add(PushSubscription.subscribe(PETR, PHONE, new PushEndpoint("https://fcm.googleapis.com/fcm/send/petr-phone-before"), CLIENT,
                PushAlerts.ALL, NOW));

        assertThatCode(() -> phone().requireRoomAmong(others)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given an administrator with ten devices that get alerts, one of them at this endpoint, when another device subscribes at it, then there is room for it")
    void should_leave_room_when_a_device_subscribes_at_a_held_endpoint_given_ten_devices() {
        List<PushSubscription> others = new ArrayList<>(devicesOf(PETR, 9));
        others.add(PushSubscription.subscribe(PETR, UUID.randomUUID(), PHONE_ENDPOINT, CLIENT, PushAlerts.ALL, NOW));

        assertThatCode(() -> phone().requireRoomAmong(others)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given nine devices of an administrator and one of another administrator, when another device of the administrator subscribes, then there is room for it")
    void should_leave_room_when_another_device_subscribes_given_one_of_ten_devices_of_another_administrator() {
        List<PushSubscription> others = new ArrayList<>(devicesOf(PETR, 9));
        others.addAll(devicesOf(JANA, 1));

        assertThatCode(() -> phone().requireRoomAmong(others)).doesNotThrowAnyException();
    }

    private static PushSubscription phone() {
        return PushSubscription.subscribe(PETR, PHONE, PHONE_ENDPOINT, CLIENT, PushAlerts.ALL, NOW);
    }

    private static List<PushSubscription> devicesOf(UUID administrator, int count) {
        return IntStream.range(0, count)
                .mapToObj(index -> PushSubscription.subscribe(administrator, UUID.randomUUID(),
                        new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + administrator + "-" + index), CLIENT, PushAlerts.ALL, NOW))
                .toList();
    }
}
