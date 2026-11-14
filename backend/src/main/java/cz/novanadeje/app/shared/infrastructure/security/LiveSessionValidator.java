package cz.novanadeje.app.shared.infrastructure.security;

import cz.novanadeje.app.shared.application.session.SessionLiveness;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Optional;
import java.util.UUID;

final class LiveSessionValidator implements OAuth2TokenValidator<Jwt> {

    private final OAuth2TokenValidator<Jwt> claims;
    private final SessionLiveness liveness;

    LiveSessionValidator(OAuth2TokenValidator<Jwt> claims, SessionLiveness liveness) {
        this.claims = claims;
        this.liveness = liveness;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        OAuth2TokenValidatorResult checked = claims.validate(token);
        if (checked.hasErrors() || token.getClaimAsString(JwtProperties.SCOPE_CLAIM) != null) {
            return checked;
        }
        Optional<UUID> session = SessionClaim.of(token);
        if (session.isEmpty() && token.hasClaim(JwtProperties.SESSION_CLAIM)) {
            return ended();
        }
        if (session.isPresent() && !liveness.isLive(session.get())) {
            return ended();
        }
        return checked;
    }

    private static OAuth2TokenValidatorResult ended() {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error(OAuth2ErrorCodes.INVALID_TOKEN, JwtProperties.SESSION_ENDED, null));
    }
}
