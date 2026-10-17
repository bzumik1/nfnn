package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.application.AccessTokenIssuer;
import cz.novanadeje.app.donors.application.IssuedAccessToken;
import cz.novanadeje.app.donors.domain.DonorId;
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
        Instant expiresAt = issuedAt.plus(properties.accessTokenTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(donorId.toString())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim(JwtProperties.ROLES_CLAIM, roles.stream().sorted(Comparator.naturalOrder()).map(Role::name).toList())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return new IssuedAccessToken(encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue(), expiresAt);
    }
}
