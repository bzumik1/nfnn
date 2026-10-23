package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AesGcmSecretSealerTest {

    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String OTHER_KEY = Base64.getEncoder().encodeToString("another-key-of-thirty-two-bytes!".getBytes());

    @Test
    @DisplayName("Given a key, when a value is sealed, then it unseals to the same value, differs each time and hides the value")
    void should_round_trip_when_sealed_given_key() {
        AesGcmSecretSealer sealer = AesGcmSecretSealer.fromKey(KEY);

        String first = sealer.seal(Setting.FIO_TOKEN, "token-ěšč");
        String second = sealer.seal(Setting.FIO_TOKEN, "token-ěšč");

        assertThat(first).startsWith("v1:").doesNotContain("token").isNotEqualTo(second);
        assertThat(sealer.unseal(Setting.FIO_TOKEN, first)).contains("token-ěšč");
    }

    @Test
    @DisplayName("Given a value sealed for one setting, when it is unsealed for another or with another key, then it cannot be read")
    void should_not_unseal_when_read_given_other_setting_or_key() {
        String sealed = AesGcmSecretSealer.fromKey(KEY).seal(Setting.FIO_TOKEN, "token");

        assertThat(AesGcmSecretSealer.fromKey(KEY).unseal(Setting.MAIL_PASSWORD, sealed)).isEmpty();
        assertThat(AesGcmSecretSealer.fromKey(OTHER_KEY).unseal(Setting.FIO_TOKEN, sealed)).isEmpty();
        assertThat(AesGcmSecretSealer.fromKey(KEY).unseal(Setting.FIO_TOKEN, "v1:garbage")).isEmpty();
        assertThat(AesGcmSecretSealer.fromKey(KEY).unseal(Setting.FIO_TOKEN, "plain")).isEmpty();
    }

    @Test
    @DisplayName("Given no key, when the sealer is asked, then it is unavailable and reads nothing")
    void should_be_unavailable_when_asked_given_no_key() {
        AesGcmSecretSealer sealer = AesGcmSecretSealer.fromKey("");

        assertThat(sealer.available()).isFalse();
        assertThat(sealer.unseal(Setting.FIO_TOKEN, AesGcmSecretSealer.fromKey(KEY).seal(Setting.FIO_TOKEN, "t"))).isEmpty();
    }

    @Test
    @DisplayName("Given a key that is not Base64 of 32 bytes, when it is read, then it is refused")
    void should_refuse_key_when_read_given_wrong_shape() {
        assertThatThrownBy(() -> AesGcmSecretSealer.fromKey("not base64!")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AesGcmSecretSealer.fromKey(Base64.getEncoder().encodeToString(new byte[16])))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
