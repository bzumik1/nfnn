package cz.novanadeje.app.contact.application;

import java.time.Duration;

public record ContactMessageRetentionProperties(Duration maxAge) {

    public ContactMessageRetentionProperties {
        if (maxAge == null || maxAge.isZero() || maxAge.isNegative()) {
            throw new IllegalArgumentException("app.contact.retention.max-age must be a positive duration, but is " + maxAge);
        }
    }
}
