package cz.novanadeje.app.contact.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.contact.retention")
public record ContactMessageRetentionProperties(Duration maxAge) {

    public ContactMessageRetentionProperties {
        if (maxAge == null || maxAge.isZero() || maxAge.isNegative()) {
            throw new IllegalArgumentException("app.contact.retention.max-age must be a positive duration, but is " + maxAge);
        }
    }
}
