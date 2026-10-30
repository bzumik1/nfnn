package cz.novanadeje.app.cucumber;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BundleTextsTest {

    private static final String VALIDATION = "\"type\":\"https://nfnn.cz/problems/validation\",\"title\":\"Neplatné údaje\",\"status\":400,"
            + "\"detail\":\"Zkontrolujte prosím označená pole.\",\"instance\":\"/api/x\"";

    @Test
    @DisplayName("Given a field message that is neither a site text nor the validator's, when the answer is checked, then it fails")
    void should_fail_when_checked_given_field_message_with_exception_text() {
        assertThatThrownBy(() -> check("{" + VALIDATION + ",\"errors\":[{\"field\":\"name\",\"message\":\"Refused: nfnn-client-value\"}]}"))
                .isInstanceOf(AssertionError.class).hasMessageContaining("errors[0].message");
    }

    @Test
    @DisplayName("Given field messages of the site and of the validator, when the answer is checked, then it passes")
    void should_pass_when_checked_given_site_and_validator_field_messages() {
        assertThatCode(() -> check("{" + VALIDATION + ",\"errors\":["
                + "{\"field\":\"email\",\"message\":\"Zadejte e-mail ve tvaru jmeno@domena.cz.\"},"
                + "{\"field\":\"year\",\"message\":\"musí být větší nebo rovna hodnotě 2005\"},"
                + "{\"field\":\"name\",\"code\":\"required\",\"message\":\"nesmí být prázdná\"}]}"))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given another property holding an exception's text, when the answer is checked, then it fails")
    void should_fail_when_checked_given_other_property_with_exception_text() {
        assertThatThrownBy(() -> check("{" + VALIDATION + ",\"reason\":\"java.lang.IllegalArgumentException: nfnn-client-value\"}"))
                .isInstanceOf(AssertionError.class).hasMessageContaining("reason");
    }

    @Test
    @DisplayName("Given the second factor's challenge and its expiry, when the answer is checked, then the server's values pass")
    void should_pass_when_checked_given_second_factor_challenge() {
        assertThatCode(() -> check("{\"type\":\"https://nfnn.cz/problems/auth/second-factor-required\",\"title\":\"Zadejte kód z aplikace\",\"status\":401,"
                + "\"challenge\":\"aBcD\",\"challengeExpiresAt\":\"2026-10-23T10:05:00Z\"}"))
                .doesNotThrowAnyException();
    }

    private static void check(String body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        BundleTexts.requireBundleTexts("PATCH /api/x", headers, body.getBytes(StandardCharsets.UTF_8));
    }
}
