package cz.novanadeje.app.shared.infrastructure.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.security.jwt")
public record JwtProperties(String issuer, String secret, Duration accessTokenTtl) {

    public static final String ROLES_CLAIM = "roles";
    private static final int MIN_SECRET_LENGTH = 32;

    public JwtProperties {
        if (secret == null || secret.length() < MIN_SECRET_LENGTH) {
            throw new IllegalArgumentException("app.security.jwt.secret must have at least " + MIN_SECRET_LENGTH + " characters");
        }
    }
}
