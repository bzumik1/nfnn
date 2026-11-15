package cz.novanadeje.app.operations.domain.push;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
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

    @Test
    @DisplayName("Given a donor with nine devices that get notifications, when another device subscribes, then there is room for it")
    void should_leave_room_when_another_device_subscribes_given_nine_devices() {
        assertThatCode(() -> DonorPushSubscription.requireRoomBeside(subscriptions(9))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given a donor with ten devices that get notifications, when another device subscribes, then it is refused as over the limit")
    void should_refuse_as_over_the_limit_when_another_device_subscribes_given_ten_devices() {
        assertThatThrownBy(() -> DonorPushSubscription.requireRoomBeside(subscriptions(10)))
                .isInstanceOf(PushSubscriptionLimitReached.class)
                .hasFieldOrPropertyWithValue("code", "operations/push-subscription-limit");
    }

    private static List<DonorPushSubscription> subscriptions(int count) {
        return IntStream.range(0, count)
                .mapToObj(index -> DonorPushSubscription.subscribe(JANA, UUID.randomUUID(),
                        new PushEndpoint("https://fcm.googleapis.com/fcm/send/device-" + index), CLIENT, DonorNotifications.ALL, NOW))
                .toList();
    }
}
