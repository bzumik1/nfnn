package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.Totp;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

record SecondFactorCodeRequest(@NotBlank @Pattern(regexp = Totp.CODE_SHAPE) String code) {

    @Override
    public String toString() {
        return "SecondFactorCodeRequest[code=***]";
    }
}
