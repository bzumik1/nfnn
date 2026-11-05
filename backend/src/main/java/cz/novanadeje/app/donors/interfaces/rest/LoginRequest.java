package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.SessionKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record LoginRequest(
        @NotBlank @Size(max = 254) String email,
        @NotBlank @Size(max = 128) String password,
        SessionKind session
) {

    SessionKind sessionKind() {
        return session == null ? SessionKind.UNNAMED : session;
    }

    @Override
    public String toString() {
        return "LoginRequest[email=***, password=***, session=" + session + "]";
    }
}
