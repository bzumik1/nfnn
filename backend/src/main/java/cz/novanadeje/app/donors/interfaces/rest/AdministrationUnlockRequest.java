package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.Totp;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record AdministrationUnlockRequest(
        @NotBlank @Size(max = RawPassword.MAX_LENGTH) String password,
        @NotBlank @Pattern(regexp = Totp.CODE_SHAPE) String secondFactorCode
) {

    @Override
    public String toString() {
        return "AdministrationUnlockRequest[password=***, secondFactorCode=***]";
    }
}
