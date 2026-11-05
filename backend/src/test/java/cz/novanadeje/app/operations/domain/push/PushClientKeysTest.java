package cz.novanadeje.app.operations.domain.push;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushClientKeysTest {

    static final String POINT = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    static final String AUTH = "BTBZMqHH6r4Tts7J_aSIgg";

    @Test
    @DisplayName("Given a point of P-256 and a 16-byte secret, when they are taken as a browser's keys, then they are kept without padding and hidden from toString")
    void should_accept_keys_when_taken_given_a_point_and_a_secret() {
        PushClientKeys keys = new PushClientKeys(POINT, AUTH + "==");

        assertThat(keys.auth()).isEqualTo(AUTH);
        assertThat(keys.p256dhBytes()).hasSize(65);
        assertThat(keys.authBytes()).hasSize(16);
        assertThat(keys.toString()).doesNotContain(POINT, AUTH);
    }

    @Test
    @DisplayName("Given a point whose last coordinate bit is flipped, when it is taken as a browser's key, then it is refused as off the curve")
    void should_refuse_key_when_taken_given_a_point_off_the_curve() {
        byte[] point = Base64.getUrlDecoder().decode(POINT);
        point[64] ^= 1;

        assertThatThrownBy(() -> new PushClientKeys(Base64.getUrlEncoder().withoutPadding().encodeToString(point), AUTH))
                .isInstanceOf(PushKeysRefused.class);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"compressed", "short", "not-base64", "coordinate-beyond-p"})
    @DisplayName("Given a key that is no uncompressed point of P-256, when it is taken as a browser's key, then it is refused")
    void should_refuse_key_when_taken_given_no_uncompressed_point(String kind) {
        byte[] point = Base64.getUrlDecoder().decode(POINT);
        String value = switch (kind) {
            case "compressed" -> {
                point[0] = 0x02;
                yield Base64.getUrlEncoder().withoutPadding().encodeToString(point);
            }
            case "short" -> POINT.substring(0, 60);
            case "not-base64" -> POINT.replace('B', '*');
            default -> {
                for (int i = 1; i < 33; i++) {
                    point[i] = (byte) 0xff;
                }
                yield Base64.getUrlEncoder().withoutPadding().encodeToString(point);
            }
        };

        assertThatThrownBy(() -> new PushClientKeys(value, AUTH)).isInstanceOf(PushKeysRefused.class);
    }

    @Test
    @DisplayName("Given a secret that is not 16 bytes, when it is taken as a browser's secret, then it is refused")
    void should_refuse_secret_when_taken_given_a_wrong_length() {
        assertThatThrownBy(() -> new PushClientKeys(POINT, "BTBZMqHH6r4Tts7J_aSI")).isInstanceOf(PushKeysRefused.class);
        assertThatThrownBy(() -> new PushClientKeys(POINT, "A".repeat(101))).isInstanceOf(PushKeysRefused.class);
    }
}
