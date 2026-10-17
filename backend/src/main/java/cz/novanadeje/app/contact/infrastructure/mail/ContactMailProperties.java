package cz.novanadeje.app.contact.infrastructure.mail;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.contact")
public record ContactMailProperties(String recipientEmail, String senderEmail) {
}
