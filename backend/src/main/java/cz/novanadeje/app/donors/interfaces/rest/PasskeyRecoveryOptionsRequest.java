package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.Totp;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

record PasskeyRecoveryOptionsRequest(
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{43}$") String token,
        @Pattern(regexp = Totp.CODE_SHAPE) String code
) {

    @Override
    public String toString() {
        return "PasskeyRecoveryOptionsRequest[token=***, code=***]";
    }
}
