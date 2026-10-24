package cz.novanadeje.app.content.application.media;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.content.media-cleanup")
public record UnusedMediaCleanupProperties(Duration maxAge) {

    public UnusedMediaCleanupProperties {
        if (maxAge == null || maxAge.isZero() || maxAge.isNegative()) {
            throw new IllegalArgumentException("app.content.media-cleanup.max-age must be a positive duration, but is " + maxAge);
        }
    }
}
