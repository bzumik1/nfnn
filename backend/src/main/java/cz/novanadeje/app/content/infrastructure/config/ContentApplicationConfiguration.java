package cz.novanadeje.app.content.infrastructure.config;

import cz.novanadeje.app.content.application.media.UnusedMediaCleanupProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ContentApplicationProperties.class)
public class ContentApplicationConfiguration {

    @Bean
    UnusedMediaCleanupProperties unusedMediaCleanupProperties(ContentApplicationProperties properties) {
        return properties.mediaCleanup();
    }
}
