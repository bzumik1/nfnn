package cz.novanadeje.app.content.infrastructure.config;

import cz.novanadeje.app.content.application.media.UnusedMediaCleanupProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("app.content")
record ContentApplicationProperties(@DefaultValue UnusedMediaCleanupProperties mediaCleanup) {
}
