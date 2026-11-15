package cz.novanadeje.app.shared.infrastructure.security;

import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Optional;

public final class ClientClaim {

    private ClientClaim() {
    }

    public static Optional<String> of(Jwt token) {
        return Optional.ofNullable(token.getClaimAsString(JwtProperties.CLIENT_CLAIM)).filter(client -> !client.isBlank());
    }
}
