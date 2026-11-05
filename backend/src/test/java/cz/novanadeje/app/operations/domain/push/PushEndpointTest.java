package cz.novanadeje.app.operations.domain.push;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushEndpointTest {

    @ParameterizedTest(name = "{0}")
    @CsvSource({
            "https://fcm.googleapis.com/fcm/send/dGVzdA:APA91b, GOOGLE, https://fcm.googleapis.com",
            "https://web.push.apple.com/QGuQyavXutnMH7Vi, APPLE, https://web.push.apple.com",
            "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk, MOZILLA, https://updates.push.services.mozilla.com",
            "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA, MICROSOFT, https://wns2-par02p.notify.windows.com",
            "https://fcm.googleapis.com:443/fcm/send/x, GOOGLE, https://fcm.googleapis.com"})
    @DisplayName("Given an https address of a known push service, when it is taken as an endpoint, then its service and origin are known")
    void should_accept_endpoint_when_taken_given_a_known_push_service(String value, PushService service, String origin) {
        PushEndpoint endpoint = new PushEndpoint(value);

        assertThat(endpoint.service()).isEqualTo(service);
        assertThat(endpoint.origin()).isEqualTo(origin);
        assertThat(endpoint.toString()).doesNotContain("send", "token", "wpush").contains(service.name());
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "http://fcm.googleapis.com/fcm/send/x",
            "https://fcm.googleapis.com:8443/fcm/send/x",
            "https://evil.example/fcm.googleapis.com",
            "https://fcm.googleapis.com.evil.example/x",
            "https://notify.windows.com/x",
            "https://evilnotify.windows.com/x",
            "https://push.apple.com.evil.example/x",
            "https://user@fcm.googleapis.com/x",
            "https://fcm.googleapis.com/x#fragment",
            "https://FCM.googleapis.com/x",
            "https://10.0.0.1/x",
            "https://127.0.0.1/x",
            "https://169.254.169.254/latest/meta-data",
            "https://[::1]/x",
            "https://localhost/x",
            "https://192.168.1.10/x",
            "https://fcm.googleapis.com./x",
            "ftp://fcm.googleapis.com/x",
            "https:fcm.googleapis.com",
            "https://"})
    @DisplayName("Given an address that is not https on a known push service, when it is taken as an endpoint, then it is refused")
    void should_refuse_endpoint_when_taken_given_an_unknown_or_private_host(String value) {
        assertThatThrownBy(() -> new PushEndpoint(value)).isInstanceOf(PushEndpointRefused.class);
    }

    @org.junit.jupiter.api.Test
    @DisplayName("Given an address longer than 1 024 characters, when it is taken as an endpoint, then it is refused")
    void should_refuse_endpoint_when_taken_given_too_long() {
        assertThatThrownBy(() -> new PushEndpoint("https://fcm.googleapis.com/" + "a".repeat(1000)))
                .isInstanceOf(PushEndpointRefused.class);
    }
}
