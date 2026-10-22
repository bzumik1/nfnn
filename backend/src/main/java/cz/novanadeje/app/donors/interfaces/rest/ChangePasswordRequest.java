package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.RawPassword;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record ChangePasswordRequest(
        @NotBlank @Size(max = RawPassword.MAX_LENGTH) String currentPassword,
        @NotBlank @Size(min = RawPassword.MIN_LENGTH, max = RawPassword.MAX_LENGTH) String newPassword
) {

    @Override
    public String toString() {
        return "ChangePasswordRequest[currentPassword=***, newPassword=***]";
    }
}
