package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.DonorEmailVerificationProperties;
import cz.novanadeje.app.donors.application.event.DonorEmailVerificationRequested;
import cz.novanadeje.app.donors.application.event.DonorRegistrationReminderDue;
import cz.novanadeje.app.donors.application.event.DonorRegistrationRepeated;
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
import java.util.UUID;

@Component
class DonorRegistrationEmailSender {

    private static final Logger log = LoggerFactory.getLogger(DonorRegistrationEmailSender.class);
    private static final String VERIFICATION_KEYS = "donors.emailVerification.email.";
    private static final String VERIFICATION_TEMPLATE = "email/donors/email-verification";
    private static final String VERIFICATION_PAGE = "/potvrzeni-emailu#token=";
    private static final String REMINDER_KEYS = "donors.registrationReminder.email.";
    private static final String REMINDER_TEMPLATE = "email/donors/registration-reminder";
    private static final String REPEATED_KEYS = "donors.registrationRepeated.email.";
    private static final String REPEATED_TEMPLATE = "email/donors/registration-repeated";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;
    private final PublicUrlProperties publicUrl;
    private final DonorEmailVerificationProperties properties;

    DonorRegistrationEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender,
                                 PublicUrlProperties publicUrl, DonorEmailVerificationProperties properties) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
        this.publicUrl = publicUrl;
        this.properties = properties;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendVerification(DonorEmailVerificationRequested event) {
        Locale locale = event.preferredLocale().toLocale();
        String link = publicUrl.link(VERIFICATION_PAGE + event.secret().value()).toString();
        long validHours = properties.tokenTtl().toHours();
        String footer = text(VERIFICATION_KEYS, "footer", locale, sender.senderEmail());
        String plainText = paragraphs(
                text(VERIFICATION_KEYS, "greeting", locale),
                text(VERIFICATION_KEYS, "intro", locale, event.email().value()),
                link,
                text(VERIFICATION_KEYS, "validity", locale, validHours),
                text(VERIFICATION_KEYS, "ignore", locale),
                text(VERIFICATION_KEYS, "signature", locale),
                footer);
        send(event.donorId(), "verification", new EmailDraft(locale, event.email().value(), text(VERIFICATION_KEYS, "subject", locale),
                text(VERIFICATION_KEYS, "title", locale), VERIFICATION_TEMPLATE,
                Map.of("email", event.email().value(), "link", link, "validHours", validHours), plainText, footer));
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendReminder(DonorRegistrationReminderDue event) {
        Locale locale = event.preferredLocale().toLocale();
        String link = publicUrl.link(VERIFICATION_PAGE + event.secret().value()).toString();
        long validHours = properties.tokenTtl().toHours();
        String footer = text(REMINDER_KEYS, "footer", locale, sender.senderEmail());
        String plainText = paragraphs(
                text(REMINDER_KEYS, "greeting", locale),
                text(REMINDER_KEYS, "intro", locale, event.email().value()),
                link,
                text(REMINDER_KEYS, "validity", locale, validHours),
                text(REMINDER_KEYS, "ignore", locale),
                text(REMINDER_KEYS, "signature", locale),
                footer);
        send(event.donorId(), "registration reminder", new EmailDraft(locale, event.email().value(), text(REMINDER_KEYS, "subject", locale),
                text(REMINDER_KEYS, "title", locale), REMINDER_TEMPLATE,
                Map.of("email", event.email().value(), "link", link, "validHours", validHours), plainText, footer));
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendRegistrationRepeated(DonorRegistrationRepeated event) {
        Locale locale = event.preferredLocale().toLocale();
        String link = publicUrl.link("/").toString();
        String footer = text(REPEATED_KEYS, "footer", locale, sender.senderEmail());
        String plainText = paragraphs(
                text(REPEATED_KEYS, "greeting", locale),
                text(REPEATED_KEYS, "intro", locale, event.email().value()),
                text(REPEATED_KEYS, "action", locale),
                link,
                text(REPEATED_KEYS, "ignore", locale),
                text(REPEATED_KEYS, "signature", locale),
                footer);
        send(event.donorId(), "repeated registration", new EmailDraft(locale, event.email().value(), text(REPEATED_KEYS, "subject", locale),
                text(REPEATED_KEYS, "title", locale), REPEATED_TEMPLATE,
                Map.of("email", event.email().value(), "link", link), plainText, footer));
    }

    private void send(UUID donorId, String kind, EmailDraft draft) {
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The {} e-mail for donor {} could not be sent: {}", kind, donorId, e.getClass().getSimpleName());
        }
    }

    private static String paragraphs(String... texts) {
        return String.join("\n\n", List.of(texts)) + "\n";
    }

    private String text(String keys, String key, Locale locale, Object... arguments) {
        return messages.getMessage(keys + key, arguments.length == 0 ? null : arguments, locale);
    }
}
