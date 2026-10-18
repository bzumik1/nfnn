package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.RawPassword;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record PasswordResetConfirmation(
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{43}$") String token,
        @NotBlank @Size(min = RawPassword.MIN_LENGTH, max = RawPassword.MAX_LENGTH) String password
) {

    @Override
    public String toString() {
        return "PasswordResetConfirmation[token=***, password=***]";
    }
}
