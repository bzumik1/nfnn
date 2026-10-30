package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.Confirmation;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record EmailChangeRequest(
        @NotBlank @Email @Pattern(regexp = EmailAddress.SHAPE_REGEX, message = "{donors.email.invalid}") @Size(max = 254) String newEmail,
        @Size(max = RawPassword.MAX_LENGTH) String password,
        @Valid PasskeySignInRequest passkey
) {

    EmailChangeRequest {
        newEmail = newEmail == null ? null : newEmail.strip();
    }

    Confirmation confirmation() {
        return ConfirmationRequests.of(password, passkey);
    }

    @Override
    public String toString() {
        return "EmailChangeRequest[newEmail=***, password=***, passkey=***]";
    }
}
