package cz.novanadeje.app.contact.infrastructure.mail;

import cz.novanadeje.app.contact.application.event.ContactMessageReceived;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.context.MessageSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

@Component
class ContactMessageEmailForwarder {

    private static final Locale FOUNDATION_LOCALE = Locale.forLanguageTag("cs");
    private static final ZoneId FOUNDATION_ZONE = ZoneId.of("Europe/Prague");
    private static final DateTimeFormatter RECEIVED_AT = DateTimeFormatter.ofPattern("d. M. yyyy H:mm");

    private final JavaMailSender mailSender;
    private final ITemplateEngine templates;
    private final MessageSource messages;
    private final ContactMailProperties properties;

    ContactMessageEmailForwarder(JavaMailSender mailSender, ITemplateEngine templates, MessageSource messages, ContactMailProperties properties) {
        this.mailSender = mailSender;
        this.templates = templates;
        this.messages = messages;
        this.properties = properties;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void forward(ContactMessageReceived event) throws MessagingException {
        MimeMessage email = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(email, "UTF-8");
        helper.setFrom(properties.senderEmail());
        helper.setTo(properties.recipientEmail());
        helper.setReplyTo(event.senderEmail().value());
        helper.setSubject(messages.getMessage("contact.email.subject", new Object[]{event.senderName()}, FOUNDATION_LOCALE));
        helper.setText(render(event), true);
        mailSender.send(email);
    }

    private String render(ContactMessageReceived event) {
        Context context = new Context(FOUNDATION_LOCALE);
        context.setVariable("senderName", event.senderName());
        context.setVariable("senderEmail", event.senderEmail().value());
        context.setVariable("body", event.body());
        context.setVariable("receivedAt", RECEIVED_AT.format(event.receivedAt().atZone(FOUNDATION_ZONE)));
        return templates.process("email/contact/message-received", context);
    }
}
