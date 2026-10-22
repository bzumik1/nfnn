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
    @DisplayName("Given a verification request, when it is printed, then the address is masked and was trimmed")
    void should_mask_email_when_printed_given_verification_request() {
        assertThat(new EmailVerificationRequest("  jana@example.cz ").toString()).isEqualTo("EmailVerificationRequest[email=***]");
        assertThat(new EmailVerificationRequest("  JANA@Example.cz ").email()).isEqualTo("JANA@Example.cz");
    }

    @Test
    @DisplayName("Given a verification confirmation, when it is printed, then the token is masked")
    void should_mask_token_when_printed_given_verification_confirmation() {
        assertThat(new EmailVerificationConfirmation(TOKEN).toString()).isEqualTo("EmailVerificationConfirmation[token=***]");
    }

    @Test
    @DisplayName("Given a login request, when it is printed, then the address and the password are masked")
    void should_mask_email_and_password_when_printed_given_login_request() {
        assertThat(new LoginRequest("jana@example.cz", PASSWORD).toString()).isEqualTo("LoginRequest[email=***, password=***]");
    }

    @Test
    @DisplayName("Given a registration request, when it is printed, then the name, the address, the e-mail and the password are masked")
    void should_mask_personal_data_when_printed_given_registration_request() {
        RegisterDonorRequest request = new RegisterDonorRequest(DonorType.COMPANY, "Jana Nováková", "25596641",
                new AddressRequest("Dlouhá 12", "Ústí nad Labem", "400 01"), "jana@example.cz", PASSWORD, "cs");

        assertThat(request.toString()).isEqualTo("RegisterDonorRequest[type=COMPANY, name=***, companyIdentifier=25596641, "
                + "address=***, email=***, password=***, preferredLocale=cs]");
    }

    @Test
    @DisplayName("Given a reset request with spaces around the address, when it is made, then the address is trimmed for validation")
    void should_trim_email_when_made_given_spaces() {
        assertThat(new PasswordResetRequest("  JANA@Example.cz ").email()).isEqualTo("JANA@Example.cz");
        assertThat(new PasswordResetRequest(null).email()).isNull();
    }

    @Test
    @DisplayName("Given a password change request, when it is printed, then both passwords are masked")
    void should_mask_both_passwords_when_printed_given_password_change_request() {
        assertThat(new ChangePasswordRequest(PASSWORD, "a brand new passphrase").toString())
                .isEqualTo("ChangePasswordRequest[currentPassword=***, newPassword=***]");
    }

    @Test
    @DisplayName("Given an e-mail change request, when it is printed, then the address and the password are masked and the address was trimmed")
    void should_mask_email_and_password_when_printed_given_email_change_request() {
        EmailChangeRequest request = new EmailChangeRequest("  Jana.Nova@Example.cz ", PASSWORD);
        assertThat(request.toString()).isEqualTo("EmailChangeRequest[newEmail=***, password=***]");
        assertThat(request.newEmail()).isEqualTo("Jana.Nova@Example.cz");
    }
}
