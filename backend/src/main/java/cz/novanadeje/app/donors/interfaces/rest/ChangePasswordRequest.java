package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.Confirmation;
import cz.novanadeje.app.donors.domain.RawPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record ChangePasswordRequest(
        @Size(max = RawPassword.MAX_LENGTH) String currentPassword,
        @Valid PasskeySignInRequest passkey,
        @NotBlank @Size(min = RawPassword.MIN_LENGTH, max = RawPassword.MAX_LENGTH) String newPassword
) {

    Confirmation confirmation() {
        return ConfirmationRequests.of(currentPassword, passkey);
    }

    @Override
    public String toString() {
        return "ChangePasswordRequest[currentPassword=***, passkey=***, newPassword=***]";
    }
}
