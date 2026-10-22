package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.Totp;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record SecondFactorLoginRequest(
        @NotBlank @Size(max = 43) String challenge,
        @NotBlank @Pattern(regexp = Totp.CODE_SHAPE) String code
) {

    @Override
    public String toString() {
        return "SecondFactorLoginRequest[challenge=***, code=***]";
    }
}
