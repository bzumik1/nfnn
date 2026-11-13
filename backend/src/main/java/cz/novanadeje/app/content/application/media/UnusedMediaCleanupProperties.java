package cz.novanadeje.app.content.application.media;

import java.time.Duration;

public record UnusedMediaCleanupProperties(Duration maxAge) {

    public UnusedMediaCleanupProperties {
        if (maxAge == null || maxAge.isZero() || maxAge.isNegative()) {
            throw new IllegalArgumentException("app.content.media-cleanup.max-age must be a positive duration, but is " + maxAge);
        }
    }
}
