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
    @DisplayName("Given a validator message that repeats the value it checked, when the answer is checked, then it fails")
    void should_fail_when_checked_given_validator_message_with_validated_value() {
        assertThatThrownBy(() -> check(withFieldMessage("kontrolní číslice pro nfnn-client-value je neplatná, kontrolní součet Luhn Modulo 10 se nezdařil")))
                .isInstanceOf(AssertionError.class).hasMessageContaining("errors[0].message");
    }

    @Test
    @DisplayName("Given a client's value where a validator message names its pattern, when the answer is checked, then it fails")
    void should_fail_when_checked_given_client_value_in_place_of_pattern() {
        assertThatThrownBy(() -> check(withFieldMessage("musí odpovídat \\\"nfnn-client-value\\\"")))
                .isInstanceOf(AssertionError.class).hasMessageContaining("errors[0].message");
    }

    @Test
    @DisplayName("Given a client's value where a validator message names a bound, when the answer is checked, then it fails")
    void should_fail_when_checked_given_client_value_in_place_of_bound() {
        assertThatThrownBy(() -> check(withFieldMessage("velikost musí ležet v rozsahu nfnn-client-value až 254")))
                .isInstanceOf(AssertionError.class).hasMessageContaining("errors[0].message");
    }

    @Test
    @DisplayName("Given validator messages naming a pattern of the site, bounds and a condition, when the answer is checked, then they pass")
    void should_pass_when_checked_given_validator_messages_with_site_pattern_bounds_and_condition() {
        assertThatCode(() -> check("{" + VALIDATION + ",\"errors\":["
                + "{\"field\":\"token\",\"message\":\"musí odpovídat \\\"^[A-Za-z0-9_-]{43}$\\\"\"},"
                + "{\"field\":\"name\",\"message\":\"velikost musí ležet v rozsahu 0 až 254\"},"
                + "{\"field\":\"amount\",\"message\":\"musí být menší než nebo rovna hodnotě 999999.99\"},"
                + "{\"field\":\"limit\",\"message\":\"musí být menší než 10\"}]}"))
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

    private static String withFieldMessage(String message) {
        return "{" + VALIDATION + ",\"errors\":[{\"field\":\"value\",\"message\":\"" + message + "\"}]}";
    }

    private static void check(String body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        BundleTexts.requireBundleTexts("PATCH /api/x", headers, body.getBytes(StandardCharsets.UTF_8));
    }
}
