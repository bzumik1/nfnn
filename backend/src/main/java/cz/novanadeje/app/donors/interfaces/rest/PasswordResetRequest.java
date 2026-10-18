package cz.novanadeje.app.donors.interfaces.rest;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record PasswordResetRequest(@NotBlank @Email @Size(max = 254) String email) {

    PasswordResetRequest {
        email = email == null ? null : email.strip();
    }

    @Override
    public String toString() {
        return "PasswordResetRequest[email=***]";
    }
}
