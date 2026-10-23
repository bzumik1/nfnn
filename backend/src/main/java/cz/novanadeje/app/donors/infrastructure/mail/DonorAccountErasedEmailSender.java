package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.event.DonorAccountErased;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.EmailDraft;
import cz.novanadeje.app.shared.infrastructure.mail.MailSenderProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
class DonorAccountErasedEmailSender {

    private static final Logger log = LoggerFactory.getLogger(DonorAccountErasedEmailSender.class);
    private static final String KEYS = "donors.erased.email.";
    private static final String TEMPLATE = "email/donors/account-erased";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;

    DonorAccountErasedEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendErasureNotice(DonorAccountErased event) {
        Locale locale = event.preferredLocale().toLocale();
        String footer = text("footer", locale, sender.senderEmail());
        String plainText = String.join("\n\n", List.of(
                text("greeting", locale),
                text("intro", locale),
                text("kept", locale),
                text("again", locale),
                text("signature", locale),
                footer)) + "\n";
        EmailDraft draft = new EmailDraft(locale, event.formerEmail().value(), text("subject", locale), text("title", locale), TEMPLATE,
                Map.of("senderEmail", sender.senderEmail()), plainText, footer);
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The erasure notice for donor {} could not be sent: {}", event.donorId(), e.getClass().getSimpleName());
        }
    }

    private String text(String key, Locale locale, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, locale);
    }
}
