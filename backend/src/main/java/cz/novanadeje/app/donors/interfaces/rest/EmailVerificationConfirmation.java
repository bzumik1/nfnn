package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.SessionKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record EmailVerificationConfirmation(@NotBlank @Size(max = 43) @Pattern(regexp = "^[A-Za-z0-9_-]{43}$") String token, SessionKind session) {

    SessionKind sessionKind() {
        return session == null ? SessionKind.UNNAMED : session;
    }

    @Override
    public String toString() {
        return "EmailVerificationConfirmation[token=***, session=" + session + "]";
    }
}
