package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SignInMethodsTest {

    private static final Instant NOW = Instant.parse("2026-11-13T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);

    @Test
    @DisplayName("Given a password and no passkey, when the password is removed, then it is refused as the last way to sign in")
    void should_refuse_when_password_removed_given_no_passkey() {
        SignInMethods methods = new SignInMethods(DONOR, true, 0);

        assertThatThrownBy(methods::withoutPassword)
                .isInstanceOf(LastSignInMethod.class)
                .hasFieldOrPropertyWithValue("code", "donors/last-sign-in-method");
    }

    @Test
    @DisplayName("Given a password and a passkey, when the password is removed, then the passkey is left")
    void should_keep_passkey_when_password_removed_given_passkey() {
        SignInMethods methods = new SignInMethods(DONOR, true, 1);

        assertThat(methods.withoutPassword()).isEqualTo(new SignInMethods(DONOR, false, 1));
    }

    @Test
    @DisplayName("Given no password and one passkey, when the passkey is removed, then it is refused as the last way to sign in")
    void should_refuse_when_passkey_removed_given_last_passkey_and_no_password() {
        SignInMethods methods = new SignInMethods(DONOR, false, 1);

        assertThatThrownBy(methods::withoutPasskey)
                .isInstanceOf(LastSignInMethod.class)
                .hasFieldOrPropertyWithValue("code", "donors/last-sign-in-method");
    }

    @Test
    @DisplayName("Given no password and two passkeys, when a passkey is removed, then one passkey is left")
    void should_keep_one_passkey_when_passkey_removed_given_two_passkeys() {
        SignInMethods methods = new SignInMethods(DONOR, false, 2);

        assertThat(methods.withoutPasskey()).isEqualTo(new SignInMethods(DONOR, false, 1));
    }

    @Test
    @DisplayName("Given a password and one passkey, when the passkey is removed, then the password is left")
    void should_keep_password_when_last_passkey_removed_given_password() {
        SignInMethods methods = new SignInMethods(DONOR, true, 1);

        assertThat(methods.withoutPasskey()).isEqualTo(new SignInMethods(DONOR, true, 0));
    }

    @Test
    @DisplayName("Given no passkey, when a passkey is removed, then it is refused as the code's own mistake, never as the client's")
    void should_refuse_as_a_server_failure_when_passkey_removed_given_none() {
        SignInMethods methods = new SignInMethods(DONOR, true, 0);

        assertThatThrownBy(methods::withoutPasskey)
                .isInstanceOf(IllegalStateException.class)
                .isNotInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given as many passkeys as the limit, when a passkey is added, then it is refused with the limit")
    void should_refuse_when_passkey_added_given_limit_reached() {
        SignInMethods methods = new SignInMethods(DONOR, true, 3);

        assertThatThrownBy(() -> methods.withPasskey(3))
                .isInstanceOf(PasskeyLimitReached.class)
                .hasFieldOrPropertyWithValue("code", "donors/passkey-limit-reached");
    }

    @Test
    @DisplayName("Given fewer passkeys than the limit, when a passkey is added, then one more passkey is held")
    void should_hold_one_more_passkey_when_passkey_added_given_room() {
        SignInMethods methods = new SignInMethods(DONOR, false, 2);

        assertThat(methods.withPasskey(3)).isEqualTo(new SignInMethods(DONOR, false, 3));
    }

    @Test
    @DisplayName("Given a donor with a password, when the sign-in methods are read with a passkey count, then they hold both")
    void should_hold_password_and_passkeys_when_read_given_donor_with_password() {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, new DonorName("Jana Nováková"), null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$2a$12$hash"), new VariableSymbol("1234567890"), LocaleCode.CS, NOW);

        assertThat(SignInMethods.of(donor, 2)).isEqualTo(new SignInMethods(DONOR, true, 2));
    }

    @Test
    @DisplayName("Given a negative passkey count, when the sign-in methods are built, then they are refused")
    void should_refuse_when_built_given_negative_passkey_count() {
        assertThatThrownBy(() -> new SignInMethods(DONOR, true, -1)).isInstanceOf(IllegalArgumentException.class);
    }
}
