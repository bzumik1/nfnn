package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceStatusSecret;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SessionKind;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;

public record IssuedTokens(String accessToken, Instant accessTokenExpiresAt, String refreshToken, Instant refreshTokenExpiresAt, Set<Role> roles,
                           SessionKind session, Optional<DeviceStatusSecret> deviceSecret) {

    public IssuedTokens(String accessToken, Instant accessTokenExpiresAt, String refreshToken, Instant refreshTokenExpiresAt, Set<Role> roles,
                        SessionKind session) {
        this(accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, roles, session, Optional.empty());
    }

    @Override
    public String toString() {
        return "IssuedTokens[accessToken=***, accessTokenExpiresAt=" + accessTokenExpiresAt + ", refreshToken=***, refreshTokenExpiresAt="
                + refreshTokenExpiresAt + ", roles=" + roles + ", session=" + session + ", deviceSecret=" + (deviceSecret.isPresent() ? "***" : "none")
                + "]";
    }
}
