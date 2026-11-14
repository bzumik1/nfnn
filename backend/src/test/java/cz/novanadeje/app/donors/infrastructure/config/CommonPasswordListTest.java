package cz.novanadeje.app.donors.infrastructure.config;

import cz.novanadeje.app.donors.domain.PasswordPolicy;
import cz.novanadeje.app.donors.domain.PasswordTooWeak;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CommonPasswordListTest {

    private static final PasswordPolicy POLICY = CommonPasswords.POLICY;
    private static final String FIRST_PASSWORD = "q1w2e3r4t5y6";
    private static final String CHANGED_PASSWORD = "q1w2e3r4t5y7";

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
        assertThatThrownBy(() -> CommonPasswordList.read("missing-passwords.txt"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("missing-passwords.txt");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("damagedLists")
    @DisplayName("Given a damaged list of common passwords, when it is loaded, then it fails naming the list and no password, so the backend stops at startup")
    void should_fail_naming_the_list_when_loaded_given_a_damaged_list(String damage, byte[] list) {
        assertThatThrownBy(() -> CommonPasswordList.policy(CommonPasswordList.LIST, list))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(CommonPasswordList.LIST)
                .hasMessageNotContaining(FIRST_PASSWORD)
                .hasMessageNotContaining(CHANGED_PASSWORD);
    }

    static Stream<Arguments> damagedLists() {
        byte[] published = CommonPasswordList.read(CommonPasswordList.LIST);
        String text = new String(published, StandardCharsets.US_ASCII);
        return Stream.of(
                Arguments.of("an empty list", new byte[0]),
                Arguments.of("a truncated list", Arrays.copyOf(published, published.length / 2)),
                Arguments.of("a changed password", text.replaceFirst(FIRST_PASSWORD, CHANGED_PASSWORD).getBytes(StandardCharsets.US_ASCII)));
    }
}
