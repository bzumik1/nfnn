package cz.novanadeje.app.contact.infrastructure.mail;

import cz.novanadeje.app.contact.application.event.ContactMessageReceived;
import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.EmailDraft;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.context.MessageSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
class ContactMessageEmailForwarder {

    private static final Locale FOUNDATION_LOCALE = Locale.forLanguageTag("cs");
    private static final DateTimeFormatter RECEIVED_AT = DateTimeFormatter.ofPattern("d. M. yyyy H:mm");
    private static final String KEYS = "contact.email.";
    private static final String TEMPLATE = "email/contact/message-received";

    private static final Logger log = LoggerFactory.getLogger(ContactMessageEmailForwarder.class);

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final ContactMailProperties properties;

    ContactMessageEmailForwarder(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, ContactMailProperties properties) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.properties = properties;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void forward(ContactMessageReceived event) {
        try {
            send(event);
        } catch (MailException | MessagingException e) {
            log.error("Contact message {} could not be forwarded: {}", event.messageId().value(), e.getClass().getSimpleName());
        }
    }

    private void send(ContactMessageReceived event) throws MessagingException {
        String receivedAt = RECEIVED_AT.format(event.receivedAt().atZone(FoundationZone.ZONE));
        MimeMessage email = emails.compose(new EmailDraft(FOUNDATION_LOCALE, properties.recipientEmail(), text("subject", event.senderName()),
                text("title"), TEMPLATE,
                Map.of("senderName", event.senderName(), "senderEmail", event.senderEmail().value(), "body", event.body(), "receivedAt", receivedAt),
                plainText(event, receivedAt), text("footer")));
        new MimeMessageHelper(email).setReplyTo(event.senderEmail().value());
        mailSender.send(email);
    }

    private String plainText(ContactMessageReceived event, String receivedAt) {
        return String.join("\n\n", List.of(
                String.join("\n",
                        text("senderName") + ": " + event.senderName(),
                        text("senderEmail") + ": " + event.senderEmail().value(),
                        text("receivedAt") + ": " + receivedAt),
                text("body") + ":\n" + event.body(),
                text("footer")
        )) + "\n";
    }

    private String text(String key, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, FOUNDATION_LOCALE);
    }
}
