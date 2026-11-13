package cz.novanadeje.app.donors.interfaces.rest;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record EmailChangeConfirmation(@NotBlank @Size(max = 43) @Pattern(regexp = "^[A-Za-z0-9_-]{43}$") String token) {

    @Override
    public String toString() {
        return "EmailChangeConfirmation[token=***]";
    }
}
