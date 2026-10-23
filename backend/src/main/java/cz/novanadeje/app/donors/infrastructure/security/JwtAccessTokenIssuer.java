package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.application.AccessTokenGrant;
import cz.novanadeje.app.donors.application.AccessTokenIssuer;
import cz.novanadeje.app.donors.application.IssuedAccessToken;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

@Component
class JwtAccessTokenIssuer implements AccessTokenIssuer {

    private final JwtEncoder encoder;
    private final JwtProperties properties;

    JwtAccessTokenIssuer(JwtEncoder encoder, JwtProperties properties) {
        this.encoder = encoder;
        this.properties = properties;
    }

    @Override
    public IssuedAccessToken issue(DonorId donorId, Set<Role> roles, Instant issuedAt) {
        return issue(new AccessTokenGrant(donorId, roles, properties.audience(), Set.of(), issuedAt, null, null));
    }

    @Override
    public IssuedAccessToken issue(AccessTokenGrant grant) {
        Instant expiresAt = grant.issuedAt().plus(properties.accessTokenTtl());
        if (grant.latestExpiry().filter(expiresAt::isAfter).isPresent()) {
            expiresAt = grant.latestExpiry().get();
        }
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(grant.donorId().toString())
                .audience(List.of(grant.audience()))
                .issuedAt(grant.issuedAt())
                .expiresAt(expiresAt)
                .claim(JwtProperties.ROLES_CLAIM, grant.roles().stream().sorted(Comparator.naturalOrder()).map(Role::name).toList());
        if (!grant.scopes().isEmpty()) {
            claims.claim(JwtProperties.SCOPE_CLAIM, OAuthScope.format(grant.scopes()));
        }
        grant.connectedClient().ifPresent(client -> claims.claim(JwtProperties.CLIENT_CLAIM, client));
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return new IssuedAccessToken(encoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue(), expiresAt);
    }
}
