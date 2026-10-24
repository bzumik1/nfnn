package cz.novanadeje.app.donors.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.donors.second-factor")
public record DonorSecondFactorProperties(Duration challengeTtl, int challengeAttempts, String issuer, Duration recoveryTtl) {

    private static final String PREFIX = "app.donors.second-factor.";

    public DonorSecondFactorProperties {
        if (challengeTtl == null || challengeTtl.isZero() || challengeTtl.isNegative()) {
            throw new IllegalArgumentException(PREFIX + "challenge-ttl must be a positive duration, but is " + challengeTtl);
        }
        if (challengeAttempts < 1) {
            throw new IllegalArgumentException(PREFIX + "challenge-attempts must be at least 1, but is " + challengeAttempts);
        }
        if (issuer == null || issuer.isBlank()) {
            throw new IllegalArgumentException(PREFIX + "issuer is required");
        }
        issuer = issuer.trim();
        if (recoveryTtl == null || recoveryTtl.isZero() || recoveryTtl.isNegative()) {
            throw new IllegalArgumentException(PREFIX + "recovery-ttl must be a positive duration, but is " + recoveryTtl);
        }
    }
}
