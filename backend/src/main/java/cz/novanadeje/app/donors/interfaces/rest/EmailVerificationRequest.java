package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.RegistrationReturn;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record EmailVerificationRequest(
        @NotBlank @Email(message = "{donors.email.invalid}") @Pattern(regexp = EmailAddress.SHAPE_REGEX, message = "{donors.email.invalid}") @Size(max = 254) String email,
        @Pattern(regexp = RegistrationReturn.PATHS) @Size(max = RegistrationReturn.MAX_PATH_LENGTH) String returnTo
) {

    EmailVerificationRequest {
        email = email == null ? null : email.strip();
    }

    @Override
    public String toString() {
        return "EmailVerificationRequest[email=***, returnTo=" + returnTo + "]";
    }
}
