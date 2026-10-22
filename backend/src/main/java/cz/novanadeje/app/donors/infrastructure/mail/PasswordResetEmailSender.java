package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.DonorPasswordResetProperties;
import cz.novanadeje.app.donors.application.event.DonorPasswordResetRequested;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
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
class PasswordResetEmailSender {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetEmailSender.class);
    private static final String KEYS = "donors.passwordReset.email.";
    private static final String TEMPLATE = "email/donors/password-reset";
    private static final String RESET_PAGE = "/obnova-hesla#token=";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;
    private final PublicUrlProperties publicUrl;
    private final DonorPasswordResetProperties properties;

    PasswordResetEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender,
                             PublicUrlProperties publicUrl, DonorPasswordResetProperties properties) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
        this.publicUrl = publicUrl;
        this.properties = properties;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void send(DonorPasswordResetRequested event) {
        try {
            Locale locale = event.preferredLocale().toLocale();
            String link = publicUrl.link(RESET_PAGE + event.secret().value()).toString();
            long validMinutes = properties.tokenTtl().toMinutes();
            mailSender.send(emails.compose(new EmailDraft(locale, event.email().value(), text("subject", locale), text("title", locale), TEMPLATE,
                    Map.of("email", event.email().value(), "link", link, "validMinutes", validMinutes),
                    plainText(event, link, validMinutes, locale), text("footer", locale, sender.senderEmail()))));
        } catch (MailException e) {
            log.error("Password reset e-mail for donor {} could not be sent: {}", event.donorId(), e.getClass().getSimpleName());
        }
    }

    private String plainText(DonorPasswordResetRequested event, String link, long validMinutes, Locale locale) {
        return String.join("\n\n", List.of(
                text("greeting", locale),
                text("intro", locale, event.email().value()),
                link,
                text("validity", locale, validMinutes),
                text("ignore", locale),
                text("signature", locale),
                text("footer", locale, sender.senderEmail())
        )) + "\n";
    }

    private String text(String key, Locale locale, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, locale);
    }
}
