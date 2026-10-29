package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.event.DonorSecondFactorDisabled;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorEnabled;
import cz.novanadeje.app.shared.domain.EmailAddress;
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
import java.util.UUID;

@Component
class DonorSecondFactorEmailSender {

    private static final Logger log = LoggerFactory.getLogger(DonorSecondFactorEmailSender.class);
    private static final String ENABLED_KEYS = "donors.secondFactorEnabled.email.";
    private static final String ENABLED_TEMPLATE = "email/donors/second-factor-enabled";
    private static final String DISABLED_KEYS = "donors.secondFactorDisabled.email.";
    private static final String DISABLED_TEMPLATE = "email/donors/second-factor-disabled";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;

    DonorSecondFactorEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendEnabledNotice(DonorSecondFactorEnabled event) {
        send(event.donorId(), event.email(), event.preferredLocale().toLocale(), ENABLED_KEYS, ENABLED_TEMPLATE);
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendDisabledNotice(DonorSecondFactorDisabled event) {
        send(event.donorId(), event.email(), event.preferredLocale().toLocale(), DISABLED_KEYS, DISABLED_TEMPLATE);
    }

    private void send(UUID donorId, EmailAddress recipient, Locale locale, String keys, String template) {
        String footer = text(keys, "footer", locale, sender.senderEmail());
        String plainText = String.join("\n\n", List.of(
                text(keys, "greeting", locale),
                text(keys, "intro", locale),
                text(keys, "action", locale),
                text(keys, "warning", locale, sender.senderEmail()),
                text(keys, "signature", locale),
                footer)) + "\n";
        EmailDraft draft = new EmailDraft(locale, recipient.value(), text(keys, "subject", locale), text(keys, "title", locale), template,
                Map.of("senderEmail", sender.senderEmail()), plainText, footer);
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The second factor e-mail {} for donor {} could not be sent: {}", template, donorId, e.getClass().getSimpleName());
        }
    }

    private String text(String keys, String key, Locale locale, Object... arguments) {
        return messages.getMessage(keys + key, arguments.length == 0 ? null : arguments, locale);
    }
}
