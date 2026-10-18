package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.domain.DonorType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RequestRecordMaskingTest {

    private static final String PASSWORD = "correct horse battery";
    private static final String TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_Q";

    @Test
    @DisplayName("Given a reset request, when it is printed, then the address is masked")
    void should_mask_email_when_printed_given_reset_request() {
        assertThat(new PasswordResetRequest("jana@example.cz").toString()).isEqualTo("PasswordResetRequest[email=***]");
    }

    @Test
    @DisplayName("Given a reset confirmation, when it is printed, then the token and the password are masked")
    void should_mask_token_and_password_when_printed_given_reset_confirmation() {
        assertThat(new PasswordResetConfirmation(TOKEN, PASSWORD).toString()).isEqualTo("PasswordResetConfirmation[token=***, password=***]");
    }

    @Test
    @DisplayName("Given a login request, when it is printed, then the password is masked")
    void should_mask_password_when_printed_given_login_request() {
        assertThat(new LoginRequest("jana@example.cz", PASSWORD).toString())
                .doesNotContain(PASSWORD)
                .isEqualTo("LoginRequest[email=jana@example.cz, password=***]");
    }

    @Test
    @DisplayName("Given a registration request, when it is printed, then the password is masked")
    void should_mask_password_when_printed_given_registration_request() {
        RegisterDonorRequest request = new RegisterDonorRequest(DonorType.PERSON, "Jana Nováková", null,
                new AddressRequest("Dlouhá 12", "Ústí nad Labem", "400 01"), "jana@example.cz", PASSWORD, "cs");

        assertThat(request.toString())
                .doesNotContain(PASSWORD)
                .contains("password=***")
                .contains("email=jana@example.cz")
                .startsWith("RegisterDonorRequest[type=PERSON, name=Jana Nováková");
    }

    @Test
    @DisplayName("Given a reset request with spaces around the address, when it is made, then the address is trimmed for validation")
    void should_trim_email_when_made_given_spaces() {
        assertThat(new PasswordResetRequest("  JANA@Example.cz ").email()).isEqualTo("JANA@Example.cz");
        assertThat(new PasswordResetRequest(null).email()).isNull();
    }
}
