package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record PasswordResetRequest(@NotBlank @Email(message = "{donors.email.invalid}") @Pattern(regexp = EmailAddress.SHAPE_REGEX, message = "{donors.email.invalid}") @Size(max = 254) String email) {

    PasswordResetRequest {
        email = email == null ? null : email.strip();
    }

    @Override
    public String toString() {
        return "PasswordResetRequest[email=***]";
    }
}
