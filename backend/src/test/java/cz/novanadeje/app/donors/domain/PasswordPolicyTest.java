package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasswordPolicyTest {

    private static final PasswordPolicy POLICY = new PasswordPolicy(Set.of("password1234", "elevenchars"));

    @Test
    @DisplayName("Given an uncommon password of twelve characters, when the policy accepts it, then it is the password")
    void should_give_password_when_accepted_given_an_uncommon_password() {
        assertThat(POLICY.accept("twelve chars")).isEqualTo(new RawPassword("twelve chars"));
    }

    @Test
    @DisplayName("Given a common password in any case, when the policy accepts it, then it is rejected as too common")
    void should_reject_when_accepted_given_common_password_in_any_case() {
        assertThatThrownBy(() -> POLICY.accept("Password1234"))
                .isInstanceOf(PasswordTooWeak.class)
                .hasFieldOrPropertyWithValue("code", "donors/password-too-common");
    }

    @Test
    @DisplayName("Given a common password that is too short, when the policy accepts it, then it is rejected as too short first")
    void should_reject_as_too_short_when_accepted_given_a_short_common_password() {
        assertThatThrownBy(() -> POLICY.accept("elevenchars"))
                .isInstanceOf(PasswordTooWeak.class)
                .hasFieldOrPropertyWithValue("code", "donors/password-too-short");
    }

    @Test
    @DisplayName("Given a missing password, when the policy accepts it, then it is rejected as too short")
    void should_reject_as_too_short_when_accepted_given_no_password() {
        assertThatThrownBy(() -> POLICY.accept(null))
                .isInstanceOf(PasswordTooWeak.class)
                .hasFieldOrPropertyWithValue("code", "donors/password-too-short");
    }

    @Test
    @DisplayName("Given a policy, when it is printed, then it names how many common passwords it holds and none of them")
    void should_name_only_the_count_when_printed() {
        assertThat(POLICY.toString()).isEqualTo("PasswordPolicy[2 common passwords]");
    }
}
