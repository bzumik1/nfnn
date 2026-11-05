package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SessionKind;

import java.time.Instant;
import java.util.Set;

public record IssuedTokens(String accessToken, Instant accessTokenExpiresAt, String refreshToken, Instant refreshTokenExpiresAt, Set<Role> roles,
                           SessionKind session) {

    @Override
    public String toString() {
        return "IssuedTokens[accessToken=***, accessTokenExpiresAt=" + accessTokenExpiresAt + ", refreshToken=***, refreshTokenExpiresAt="
                + refreshTokenExpiresAt + ", roles=" + roles + ", session=" + session + "]";
    }
}
