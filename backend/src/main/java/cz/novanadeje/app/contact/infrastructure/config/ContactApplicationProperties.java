package cz.novanadeje.app.contact.infrastructure.config;

import cz.novanadeje.app.contact.application.ContactMessageRetentionProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("app.contact")
record ContactApplicationProperties(@DefaultValue ContactMessageRetentionProperties retention) {
}
