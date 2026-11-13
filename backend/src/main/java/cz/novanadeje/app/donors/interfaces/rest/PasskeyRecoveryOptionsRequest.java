package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.Totp;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record PasskeyRecoveryOptionsRequest(
        @NotBlank @Size(max = 43) @Pattern(regexp = "^[A-Za-z0-9_-]{43}$") String token,
        @Size(max = Totp.DIGITS) @Pattern(regexp = Totp.CODE_SHAPE) String code
) {

    @Override
    public String toString() {
        return "PasskeyRecoveryOptionsRequest[token=***, code=***]";
    }
}
