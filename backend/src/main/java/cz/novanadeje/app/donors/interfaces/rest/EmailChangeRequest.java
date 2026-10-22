package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record EmailChangeRequest(
        @NotBlank @Email @Pattern(regexp = EmailAddress.SHAPE_REGEX) @Size(max = 254) String newEmail,
        @NotBlank @Size(max = RawPassword.MAX_LENGTH) String password
) {

    EmailChangeRequest {
        newEmail = newEmail == null ? null : newEmail.strip();
    }

    @Override
    public String toString() {
        return "EmailChangeRequest[newEmail=***, password=***]";
    }
}
