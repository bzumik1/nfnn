package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.RawPassword;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record PasskeyOptionsRequest(@NotBlank @Size(max = RawPassword.MAX_LENGTH) String password) {

    @Override
    public String toString() {
        return "PasskeyOptionsRequest[password=***]";
    }
}
