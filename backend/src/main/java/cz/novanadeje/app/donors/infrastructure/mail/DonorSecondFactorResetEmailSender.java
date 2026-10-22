package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.event.DonorSecondFactorReset;
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
class DonorSecondFactorResetEmailSender {

    private static final Logger log = LoggerFactory.getLogger(DonorSecondFactorResetEmailSender.class);
    private static final String KEYS = "donors.secondFactorReset.email.";
    private static final String TEMPLATE = "email/donors/second-factor-reset";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;

    DonorSecondFactorResetEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendResetNotice(DonorSecondFactorReset event) {
        Locale locale = event.preferredLocale().toLocale();
        String footer = text("footer", locale, sender.senderEmail());
        String plainText = String.join("\n\n", List.of(
                text("greeting", locale),
                text("intro", locale),
                text("action", locale),
                text("warning", locale, sender.senderEmail()),
                text("signature", locale),
                footer)) + "\n";
        EmailDraft draft = new EmailDraft(locale, event.email().value(), text("subject", locale), text("title", locale), TEMPLATE,
                Map.of("senderEmail", sender.senderEmail()), plainText, footer);
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The second factor reset e-mail for donor {} could not be sent: {}", event.donorId(), e.getClass().getSimpleName());
        }
    }

    private String text(String key, Locale locale, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, locale);
    }
}
