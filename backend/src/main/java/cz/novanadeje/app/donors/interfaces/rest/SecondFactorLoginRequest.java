package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.donors.domain.Totp;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record SecondFactorLoginRequest(
        @NotBlank @Size(max = 43) String challenge,
        @NotBlank @Pattern(regexp = Totp.CODE_SHAPE) String code,
        SessionKind session
) {

    SessionKind sessionKind() {
        return session == null ? SessionKind.UNNAMED : session;
    }

    @Override
    public String toString() {
        return "SecondFactorLoginRequest[challenge=***, code=***, session=" + session + "]";
    }
}
