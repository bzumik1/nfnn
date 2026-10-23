package cz.novanadeje.app.donors.application;

import java.time.Instant;

public record IssuedAccessToken(String token, Instant expiresAt) {

    @Override
    public String toString() {
        return "IssuedAccessToken[token=***, expiresAt=" + expiresAt + "]";
    }
}
