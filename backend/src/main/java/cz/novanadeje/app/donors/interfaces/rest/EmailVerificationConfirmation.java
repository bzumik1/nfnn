package cz.novanadeje.app.donors.interfaces.rest;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

record EmailVerificationConfirmation(@NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{43}$") String token) {

    @Override
    public String toString() {
        return "EmailVerificationConfirmation[token=***]";
    }
}
