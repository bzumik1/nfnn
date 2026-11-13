package cz.novanadeje.app.contact.infrastructure.config;

import cz.novanadeje.app.contact.application.ContactMessageRetentionProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ContactApplicationProperties.class)
public class ContactApplicationConfiguration {

    @Bean
    ContactMessageRetentionProperties contactMessageRetentionProperties(ContactApplicationProperties properties) {
        return properties.retention();
    }
}
