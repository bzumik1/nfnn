package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.domain.PasswordPolicy;
import cz.novanadeje.app.donors.domain.PasswordTooWeak;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CommonPasswordListTest {

    private static final PasswordPolicy POLICY = CommonPasswordList.policy();

    @Test
    @DisplayName("Given the list of common passwords, when it is loaded, then the policy holds its ten thousand passwords")
    void should_hold_ten_thousand_passwords_when_loaded() {
        assertThat(POLICY.commonPasswords()).hasSize(10_004);
    }

    @ParameterizedTest
    @ValueSource(strings = {"1qaz2wsx3edc", "Q1W2E3R4T5Y6", "justinbieber", "heslo1234567"})
    @DisplayName("Given a password among the ten thousand most common of 12 characters or more, when the loaded policy accepts it, then it is refused as too common")
    void should_reject_when_accepted_given_one_of_ten_thousand_common_passwords(String common) {
        assertThatThrownBy(() -> POLICY.accept(common))
                .isInstanceOf(PasswordTooWeak.class)
                .hasFieldOrPropertyWithValue("code", "donors/password-too-common");
    }

    @Test
    @DisplayName("Given an uncommon passphrase, when the loaded policy accepts it, then it is accepted")
    void should_accept_when_accepted_given_an_uncommon_passphrase() {
        assertThat(POLICY.accept("correct horse battery").value()).isEqualTo("correct horse battery");
    }

    @Test
    @DisplayName("Given a list missing from the classpath, when it is read, then it fails naming the list, so the backend stops at startup")
    void should_fail_naming_the_list_when_read_given_a_missing_list() {
        assertThatThrownBy(() -> CommonPasswordList.lines("missing-passwords.txt"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("missing-passwords.txt");
    }
}
