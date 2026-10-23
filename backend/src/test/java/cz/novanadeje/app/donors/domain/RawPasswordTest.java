package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RawPasswordTest {

    @Test
    void should_accept_when_created_given_twelve_characters() {
        assertThat(new RawPassword("twelve chars").value()).isEqualTo("twelve chars");
    }

    @Test
    void should_reject_when_created_given_eleven_characters() {
        assertThatThrownBy(() -> new RawPassword("elevenchars"))
                .isInstanceOf(PasswordTooWeak.class)
                .hasFieldOrPropertyWithValue("code", "donors/password-too-short");
    }

    @Test
    void should_reject_when_created_given_more_than_128_characters() {
        assertThatThrownBy(() -> new RawPassword("x".repeat(129)))
                .isInstanceOf(PasswordTooWeak.class)
                .hasFieldOrPropertyWithValue("code", "donors/password-too-long");
    }

    @Test
    void should_reject_when_created_given_common_password_in_any_case() {
        assertThatThrownBy(() -> new RawPassword("Password1234"))
                .isInstanceOf(PasswordTooWeak.class)
                .hasFieldOrPropertyWithValue("code", "donors/password-too-common");
    }

    @ParameterizedTest
    @ValueSource(strings = {"1qaz2wsx3edc", "Q1W2E3R4T5Y6", "justinbieber", "heslo1234567"})
    @DisplayName("Given a password among the ten thousand most common of 12 characters or more, when it is created, then it is refused as too common")
    void should_reject_when_created_given_one_of_ten_thousand_common_passwords(String common) {
        assertThatThrownBy(() -> new RawPassword(common))
                .isInstanceOf(PasswordTooWeak.class)
                .hasFieldOrPropertyWithValue("code", "donors/password-too-common");
    }

    @Test
    void should_hide_value_when_printed() {
        assertThat(new RawPassword("twelve chars").toString()).doesNotContain("twelve chars");
    }
}
