package cz.novanadeje.app.donors.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.donors.password-reset")
public record DonorPasswordResetProperties(Duration tokenTtl, int maxLiveLinks) {

    private static final String PREFIX = "app.donors.password-reset.";

    public DonorPasswordResetProperties {
        if (tokenTtl == null || tokenTtl.isZero() || tokenTtl.isNegative()) {
            throw new IllegalArgumentException(PREFIX + "token-ttl must be a positive duration, but is " + tokenTtl);
        }
        if (maxLiveLinks < 1) {
            throw new IllegalArgumentException(PREFIX + "max-live-links must be at least 1, but is " + maxLiveLinks);
        }
    }
}
