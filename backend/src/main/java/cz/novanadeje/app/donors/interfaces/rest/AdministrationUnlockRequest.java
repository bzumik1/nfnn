package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.PasskeyProof;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.Totp;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Optional;

@PasskeyOrPasswordWithCode
record AdministrationUnlockRequest(
        @Size(max = RawPassword.MAX_LENGTH) String password,
        @Pattern(regexp = Totp.CODE_SHAPE) String secondFactorCode,
        @Valid PasskeySignInRequest passkey
) {

    Optional<PasskeyProof> passkeyProof() {
        return Optional.ofNullable(passkey).map(given -> new PasskeyProof(given.challenge(), given.assertion()));
    }

    @Override
    public String toString() {
        return "AdministrationUnlockRequest[password=***, secondFactorCode=***, passkey=***]";
    }
}
