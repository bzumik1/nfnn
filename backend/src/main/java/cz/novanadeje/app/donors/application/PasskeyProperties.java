package cz.novanadeje.app.donors.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.donors.passkeys")
public record PasskeyProperties(Duration challengeTtl, int maxPerDonor, String relyingPartyName) {

    private static final String PREFIX = "app.donors.passkeys.";

    public PasskeyProperties {
        if (challengeTtl == null || challengeTtl.isZero() || challengeTtl.isNegative()) {
            throw new IllegalArgumentException(PREFIX + "challenge-ttl must be a positive duration, but is " + challengeTtl);
        }
        if (maxPerDonor < 1) {
            throw new IllegalArgumentException(PREFIX + "max-per-donor must be at least 1, but is " + maxPerDonor);
        }
        if (relyingPartyName == null || relyingPartyName.isBlank()) {
            throw new IllegalArgumentException(PREFIX + "relying-party-name is required");
        }
        relyingPartyName = relyingPartyName.trim();
    }
}
