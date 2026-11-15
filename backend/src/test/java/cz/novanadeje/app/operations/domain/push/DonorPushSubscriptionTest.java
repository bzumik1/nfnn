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

class DonorPushSubscriptionTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final PushClientKeys CLIENT = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
    private static final UUID JANA = UUID.randomUUID();
    private static final UUID PETR = UUID.randomUUID();
    private static final UUID PHONE = UUID.randomUUID();
    private static final PushEndpoint PHONE_ENDPOINT = new PushEndpoint("https://fcm.googleapis.com/fcm/send/jana-phone");

    @Test
    @DisplayName("Given a donor with nine devices that get notifications, when another device subscribes, then there is room for it")
    void should_leave_room_when_another_device_subscribes_given_nine_devices() {
        assertThatCode(() -> phone().requireRoomAmong(devicesOf(JANA, 9))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given a donor with ten devices that get notifications, when another device subscribes, then it is refused as over the limit")
    void should_refuse_as_over_the_limit_when_another_device_subscribes_given_ten_devices() {
        assertThatThrownBy(() -> phone().requireRoomAmong(devicesOf(JANA, 10)))
                .isInstanceOf(PushSubscriptionLimitReached.class)
                .hasFieldOrPropertyWithValue("code", "operations/push-subscription-limit");
    }

    @Test
    @DisplayName("Given a donor with ten devices that get notifications, one of them this device, when this device subscribes again, then there is room for it")
    void should_leave_room_when_the_device_subscribes_again_given_ten_devices_with_its_earlier_subscription() {
        List<DonorPushSubscription> others = new ArrayList<>(devicesOf(JANA, 9));
        others.add(DonorPushSubscription.subscribe(JANA, PHONE, new PushEndpoint("https://fcm.googleapis.com/fcm/send/jana-phone-before"), CLIENT,
                DonorNotifications.ALL, NOW));

        assertThatCode(() -> phone().requireRoomAmong(others)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given a donor with ten devices that get notifications, one of them at this endpoint, when another device subscribes at it, then there is room for it")
    void should_leave_room_when_a_device_subscribes_at_a_held_endpoint_given_ten_devices() {
        List<DonorPushSubscription> others = new ArrayList<>(devicesOf(JANA, 9));
        others.add(DonorPushSubscription.subscribe(JANA, UUID.randomUUID(), PHONE_ENDPOINT, CLIENT, DonorNotifications.ALL, NOW));

        assertThatCode(() -> phone().requireRoomAmong(others)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given nine devices of a donor and one of another donor, when another device of the donor subscribes, then there is room for it")
    void should_leave_room_when_another_device_subscribes_given_one_of_ten_devices_of_another_donor() {
        List<DonorPushSubscription> others = new ArrayList<>(devicesOf(JANA, 9));
        others.addAll(devicesOf(PETR, 1));

        assertThatCode(() -> phone().requireRoomAmong(others)).doesNotThrowAnyException();
    }

    private static DonorPushSubscription phone() {
        return DonorPushSubscription.subscribe(JANA, PHONE, PHONE_ENDPOINT, CLIENT, DonorNotifications.ALL, NOW);
    }

    private static List<DonorPushSubscription> devicesOf(UUID donor, int count) {
        return IntStream.range(0, count)
                .mapToObj(index -> DonorPushSubscription.subscribe(donor, UUID.randomUUID(),
                        new PushEndpoint("https://fcm.googleapis.com/fcm/send/" + donor + "-" + index), CLIENT, DonorNotifications.ALL, NOW))
                .toList();
    }
}
