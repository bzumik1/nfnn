package cz.novanadeje.app.donors.interfaces.rest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class SecretResponsesTest {

    @Test
    @DisplayName("Given responses that carry tokens or a second-factor secret, when they are printed, then neither appears")
    void should_mask_secrets_when_printed_given_secret_responses() {
        assertThat(new TokenResponse("access-secret", "Bearer", 900, "refresh-secret", "admin:read", null).toString())
                .doesNotContain("access-secret", "refresh-secret").contains("admin:read");
        assertThat(new AuthResponse(null, "access-secret", Instant.EPOCH).toString()).doesNotContain("access-secret");
        assertThat(new SecondFactorEnrolmentResponse("TOTPSECRET", "otpauth://totp/x?secret=TOTPSECRET",
                new SecondFactorEnrolmentResponse.QrCodeResponse(1, "1")).toString()).doesNotContain("TOTPSECRET");
    }
}
