package cz.novanadeje.app.shared.infrastructure.security;

import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

public final class SessionClaim {

    private static final Pattern AS_SIGNED = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    private SessionClaim() {
    }

    public static Optional<UUID> of(Jwt token) {
        return Optional.ofNullable(token.getClaimAsString(JwtProperties.SESSION_CLAIM))
                .filter(session -> AS_SIGNED.matcher(session).matches())
                .map(UUID::fromString);
    }
}
