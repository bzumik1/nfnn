package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TotpSecretTest {

    @Test
    @DisplayName("Given nothing, when a secret is generated, then it is 32 base32 characters that decode to 20 bytes and differ each time")
    void should_generate_random_base32_secret() {
        TotpSecret first = TotpSecret.generate();
        TotpSecret second = TotpSecret.generate();

        assertThat(first.value()).matches("[A-Z2-7]{32}");
        assertThat(first.bytes()).hasSize(20);
        assertThat(first).isNotEqualTo(second);
    }

    @Test
    @DisplayName("Given the RFC 6238 secret in base32, when its bytes are read, then they are the ASCII digits the RFC uses")
    void should_decode_base32_when_bytes_read_given_rfc_secret() {
        assertThat(new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").bytes())
                .isEqualTo("12345678901234567890".getBytes(StandardCharsets.US_ASCII));
    }

    @Test
    @DisplayName("Given an issuer with a space and an account e-mail, when the otpauth link is built, then both are percent-encoded and the parameters are the standard ones")
    void should_build_otpauth_uri() {
        TotpSecret secret = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

        assertThat(secret.otpauthUri("Nová naděje", "jana@example.cz")).isEqualTo(
                "otpauth://totp/Nov%C3%A1%20nad%C4%9Bje:jana%40example.cz?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
                        + "&issuer=Nov%C3%A1%20nad%C4%9Bje&algorithm=SHA1&digits=6&period=30");
    }

    @Test
    @DisplayName("Given a secret, when it is printed, then the value is masked")
    void should_mask_value_when_printed() {
        assertThat(TotpSecret.generate().toString()).isEqualTo("TotpSecret[***]");
    }

    @Test
    @DisplayName("Given a value of the wrong length or alphabet, when a secret is made of it, then it is refused")
    void should_refuse_malformed_value() {
        assertThatThrownBy(() -> new TotpSecret("GEZDGNBVGY3TQOJQ")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TotpSecret("gezdgnbvgy3tqojqgezdgnbvgy3tqojq")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJ1")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TotpSecret(null)).isInstanceOf(IllegalArgumentException.class);
    }
}
