package cz.novanadeje.app.shared.infrastructure.mail;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.mail")
public record MailSenderProperties(String senderEmail) {

    public MailSenderProperties {
        if (senderEmail == null || senderEmail.isBlank()) {
            throw new IllegalArgumentException("MAIL_FROM (app.mail.sender-email) is required");
        }
        senderEmail = senderEmail.trim();
    }
}
