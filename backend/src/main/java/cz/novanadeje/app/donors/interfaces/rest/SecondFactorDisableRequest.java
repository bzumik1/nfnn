package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.Confirmation;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.Totp;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record SecondFactorDisableRequest(
        @Size(max = RawPassword.MAX_LENGTH) String password,
        @Valid PasskeySignInRequest passkey,
        @NotBlank @Pattern(regexp = Totp.CODE_SHAPE) String code
) {

    Confirmation confirmation() {
        return ConfirmationRequests.of(password, passkey);
    }

    @Override
    public String toString() {
        return "SecondFactorDisableRequest[password=***, passkey=***, code=***]";
    }
}
