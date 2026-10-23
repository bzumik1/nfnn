package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.Confirmation;
import cz.novanadeje.app.donors.domain.RawPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

record SecondFactorSetupRequest(@Size(max = RawPassword.MAX_LENGTH) String password, @Valid PasskeySignInRequest passkey) {

    Confirmation confirmation() {
        return ConfirmationRequests.of(password, passkey);
    }

    @Override
    public String toString() {
        return "SecondFactorSetupRequest[password=***, passkey=***]";
    }
}
