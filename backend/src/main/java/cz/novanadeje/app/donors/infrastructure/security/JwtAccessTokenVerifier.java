package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.application.AccessTokenVerifier;
import cz.novanadeje.app.donors.application.VerifiedAccessToken;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.InvalidGrant;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.infrastructure.security.AccessTokenDecoder;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@Component
class JwtAccessTokenVerifier implements AccessTokenVerifier {

    private final AccessTokenDecoder decoder;

    JwtAccessTokenVerifier(AccessTokenDecoder decoder) {
        this.decoder = decoder;
    }

    @Override
    public VerifiedAccessToken verify(String token) {
        if (token == null || token.isBlank()) {
            throw new InvalidGrant("subject_token is required");
        }
        Jwt jwt;
        try {
            jwt = decoder.decode(token);
        } catch (JwtException invalid) {
            throw new InvalidGrant("the subject token is invalid or expired");
        }
        String scope = jwt.getClaimAsString(JwtProperties.SCOPE_CLAIM);
        Set<OAuthScope> scopes = scope == null || scope.isBlank() ? Set.of() : OAuthScope.parse(scope);
        return new VerifiedAccessToken(DonorId.of(jwt.getSubject()), roles(jwt.getClaimAsStringList(JwtProperties.ROLES_CLAIM)),
                Set.copyOf(jwt.getAudience() == null ? List.of() : jwt.getAudience()), scopes, jwt.getExpiresAt());
    }

    private static Set<Role> roles(List<String> names) {
        EnumSet<Role> roles = EnumSet.noneOf(Role.class);
        if (names != null) {
            names.forEach(name -> roles.add(Role.valueOf(name)));
        }
        return Set.copyOf(roles);
    }
}
